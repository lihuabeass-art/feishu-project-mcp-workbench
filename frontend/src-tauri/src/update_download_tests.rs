use super::*;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
};

const TEST_POLICY: Policy = Policy {
    segment_bytes: 4,
    attempts: 3,
    retry_delay: Duration::ZERO,
};

fn test_client() -> Client {
    client(Duration::from_millis(80), Duration::from_secs(2)).unwrap()
}

fn request(stream: &mut TcpStream) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut result = Vec::new();
    let mut byte = [0];
    while !result.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).unwrap();
        result.push(byte[0]);
    }
    String::from_utf8(result).unwrap().to_lowercase()
}

fn server(serve: impl FnOnce(TcpListener) + Send + 'static) -> (Url, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = Url::parse(&format!(
        "http://{}/package",
        listener.local_addr().unwrap()
    ))
    .unwrap();
    (url, thread::spawn(move || serve(listener)))
}

fn reply(stream: &mut TcpStream, range: &str, body: &str) {
    write!(stream, "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {range}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
}

#[tokio::test]
async fn stalled_segment_retries_only_missing_range_and_completes() {
    let (url, handle) = server(|listener| {
        for (index, expected) in ["0-3", "4-7", "4-7", "8-9"].iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            assert!(request(&mut stream).contains(&format!("range: bytes={expected}\r\n")));
            match index {
                0 => reply(&mut stream, "0-3/10", "abcd"),
                1 => {
                    write!(stream, "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 4-7/10\r\nContent-Length: 4\r\n\r\nef").unwrap();
                    stream.flush().unwrap();
                    // Keep only this connection stalled; the listener must still
                    // accept the retry immediately, like a real HTTP server.
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(180));
                        drop(stream);
                    });
                }
                2 => reply(&mut stream, "4-7/10", "efgh"),
                _ => reply(&mut stream, "8-9/10", "ij"),
            }
        }
    });
    let mut buffer = Buffer::default();
    let mut events = Vec::new();
    transfer(
        &test_client(),
        &url,
        &mut buffer,
        TEST_POLICY,
        &mut |event| events.push(event),
    )
    .await
    .unwrap();
    handle.join().unwrap();
    assert_eq!(buffer.bytes, b"abcdefghij");
    assert!(events
        .iter()
        .any(|e| matches!(e, DownloadEvent::Retrying { .. })));
    assert_eq!(
        events
            .iter()
            .filter_map(|e| if let DownloadEvent::Progress { chunk_length } = e {
                Some(chunk_length)
            } else {
                None
            })
            .sum::<usize>(),
        10
    );
}

#[tokio::test]
async fn exhausted_retries_return_error_and_manual_retry_preserves_completed_ranges() {
    let (url, handle) = server(|listener| {
        for index in 0..5 {
            let (mut stream, _) = listener.accept().unwrap();
            let expected = if index == 0 { "0-3" } else { "4-7" };
            assert!(request(&mut stream).contains(&format!("range: bytes={expected}\r\n")));
            if index == 0 {
                reply(&mut stream, "0-3/8", "abcd");
            } else if index == 4 {
                reply(&mut stream, "4-7/8", "efgh");
            } else {
                write!(
                    stream,
                    "HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
            }
        }
    });
    let client = test_client();
    let mut buffer = Buffer::default();
    let error = transfer(&client, &url, &mut buffer, TEST_POLICY, &mut |_| {})
        .await
        .unwrap_err();
    assert!(error.contains("已尝试 3 次"));
    assert_eq!(buffer.bytes, b"abcd");
    transfer(&client, &url, &mut buffer, TEST_POLICY, &mut |_| {})
        .await
        .unwrap();
    handle.join().unwrap();
    assert_eq!(buffer.bytes, b"abcdefgh");
}

#[tokio::test]
async fn server_ignoring_range_replaces_partial_content_instead_of_appending() {
    let (url, handle) = server(|listener| {
        let (mut stream, _) = listener.accept().unwrap();
        assert!(request(&mut stream).contains("range: bytes=4-7\r\n"));
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nabcdefgh"
        )
        .unwrap();
    });
    let mut buffer = Buffer {
        bytes: b"abcd".to_vec(),
        total: Some(8),
        complete: false,
    };
    transfer(&test_client(), &url, &mut buffer, TEST_POLICY, &mut |_| {})
        .await
        .unwrap();
    handle.join().unwrap();
    assert_eq!(buffer.bytes, b"abcdefgh");
}

#[tokio::test]
async fn invalid_or_changed_range_fails_and_discards_partial_content() {
    for range in ["0-3/8", "4-7/9", "4-8/8", "invalid"] {
        let range = range.to_owned();
        let (url, handle) = server(move |listener| {
            let (mut stream, _) = listener.accept().unwrap();
            request(&mut stream);
            reply(&mut stream, &range, "efgh");
        });
        let mut buffer = Buffer {
            bytes: b"abcd".to_vec(),
            total: Some(8),
            complete: false,
        };
        assert!(
            transfer(&test_client(), &url, &mut buffer, TEST_POLICY, &mut |_| {})
                .await
                .is_err()
        );
        handle.join().unwrap();
        assert!(buffer.bytes.is_empty());
    }
}

#[test]
fn complete_package_verification_accepts_valid_signature_and_rejects_tampering() {
    // Public test vector from minisign-verify 0.2.5 (MIT), already included in
    // THIRD_PARTY_NOTICES.md. No application signing key is used by tests.
    let key = STANDARD.encode("untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3");
    let signature = STANDARD.encode("untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==");
    assert!(verify(b"test", &signature, &key).is_ok());
    assert!(verify(b"tesT", &signature, &key).is_err());
    assert!(verify(b"tes", &signature, &key).is_err());
    assert!(verify(b"test", "bad signature", &key).is_err());
    assert!(verify(b"test", &signature, "bad key").is_err());
}
