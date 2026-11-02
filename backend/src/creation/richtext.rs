//! 已观测的上传图片回读规范化；不对普通正文做 trim 或 Markdown 重写。
use serde_json::Value;
use std::borrow::Cow;

struct Image<'a> { alt: &'a str, url: &'a str, comment: &'a str }
struct Parts<'a> { images: Vec<Image<'a>>, text: Vec<&'a str> }
pub(super) struct ImageChange<'a> {
    pub original_url: &'a str,
    pub original_token: &'a str,
    pub remote_url: &'a str,
}

fn parts(value: &str) -> Option<Parts<'_>> {
    let mut images = Vec::new();
    let mut text = Vec::new();
    let mut rest = value;
    while let Some(start) = rest.find("![") {
        let before = &rest[..start];
        if before.ends_with('\\') { return None; }
        text.push(before);
        let image = &rest[start + 2..];
        let (alt, image) = image.split_once("](")?;
        if alt.contains(['[', ']', '\n', '\r']) { return None; }
        let (url, image) = image.split_once(')')?;
        if super::images::remote_url(url).ok().as_deref() != Some(url) { return None; }
        let comment = image.strip_prefix("<!--")?;
        let (comment, after) = comment.split_once("-->")?;
        images.push(Image { alt, url, comment });
        rest = after;
    }
    text.push(rest);
    // 不在代码、HTML 或转义上下文中猜测图片语法；原文相等仍走外部快路径。
    if images.is_empty() || text.iter().any(|part| part.contains(['`', '<', '>']) || part.lines().any(|line| line.starts_with("    ") || line.starts_with('\t') || line.trim_start_matches(' ').starts_with("~~~"))) { return None; }
    Some(Parts { images, text })
}

fn generated_uuid(comment: &str) -> bool {
    let Some(json) = comment.trim().strip_prefix("image:") else { return false; };
    let Ok(Value::Object(metadata)) = serde_json::from_str(json) else { return false; };
    if metadata.len() != 1 { return false; }
    let Some(uuid) = metadata.get("uuid").and_then(Value::as_str) else { return false; };
    uuid.len() == 36 && uuid.bytes().enumerate().all(|(index, byte)| {
        if [8, 13, 18, 23].contains(&index) { byte == b'-' } else { byte.is_ascii_hexdigit() }
    })
}

fn uploaded_token(comment: &str) -> bool {
    !comment.starts_with("image:") && super::images::file_token(comment).is_ok()
}

// Only an exact, single final placeholder is special. Other invisible characters
// remain user content, and code/HTML/escaped images remain outside this adapter.
fn pure_images(value: &str, allow_generated: bool) -> Option<&str> {
    let base = value.strip_suffix('\u{200b}').unwrap_or(value);
    let parsed = parts(base)?;
    if parsed.text.iter().any(|text| !text.chars().all(char::is_whitespace))
        || parsed.images.iter().any(|image| !(uploaded_token(image.comment) || (allow_generated && generated_uuid(image.comment)))) { return None; }
    Some(base)
}

pub(super) fn prepare_for_send(value: &str) -> Cow<'_, str> {
    if !value.ends_with('\u{200b}') && pure_images(value, false).is_some() {
        Cow::Owned(format!("{value}\u{200b}"))
    } else { Cow::Borrowed(value) }
}

#[cfg(test)]
pub(super) fn matches(submitted: &str, remote: &str) -> bool {
    matches_with_images(submitted, remote, |_| false)
}

pub(super) fn matches_with_images(submitted: &str, remote: &str, mut verify: impl FnMut(ImageChange<'_>) -> bool) -> bool {
    let Some(changes) = image_changes(submitted, remote) else { return false; };
    // Structural checks finish before any download or original-cache lookup.
    changes.into_iter().all(|image| verify(image))
}

fn image_changes<'a>(submitted: &'a str, remote: &'a str) -> Option<Vec<ImageChange<'a>>> {
    if submitted == remote { return Some(Vec::new()); }
    if let Some(changes) = normalized_changes(submitted, remote) { return Some(changes); }
    if let (Some(sent), Some(read)) = (pure_images(submitted, false), pure_images(remote, true)) {
        // The compatibility character is transport-only for pure uploaded images.
        // Never erase it from prose or from the middle of any document.
        return if sent == read { Some(Vec::new()) } else { normalized_changes(sent, read) };
    }
    None
}

fn normalized_changes<'a>(submitted: &'a str, remote: &'a str) -> Option<Vec<ImageChange<'a>>> {
    let (submitted, remote) = (parts(submitted)?, parts(remote)?);
    if submitted.images.len() != remote.images.len() || submitted.text[0] != remote.text[0] { return None; }
    let mut changes = Vec::new();
    for (index, (sent, read)) in submitted.images.iter().zip(&remote.images).enumerate() {
        if !(read.alt.is_empty() || sent.alt == read.alt)
            || super::images::file_token(sent.comment).is_err() || !generated_uuid(read.comment) { return None; }
        let sent_text = submitted.text[index + 1];
        let read_text = remote.text[index + 1];
        // 已观测：图片紧邻正文被转换为块级图片，并插入一个空行。
        if sent_text != read_text && !(sent_text.chars().next().is_some_and(|c| !c.is_whitespace()) && read_text.strip_prefix("\n\n") == Some(sent_text)) { return None; }
        if sent.url != read.url { changes.push(ImageChange { original_url: sent.url, original_token: sent.comment, remote_url: read.url }); }
    }
    Some(changes)
}

#[cfg(test)]
mod tests {
    use super::{matches, prepare_for_send};
    const URL: &str = "https://example.invalid/image.png";
    fn sent(url: &str, text: &str) -> String { format!("![截图]({url})<!--fixture-token-->{text}") }
    fn read(url: &str, text: &str) -> String { format!("![]({url})<!-- image:{{\"uuid\":\"12345678-1234-1234-1234-123456789abc\"}} -->\n\n{text}") }

    #[test]
    fn migrated_images_require_complete_structure_then_position_specific_identity() {
        let source = sent(URL, "正文");
        let migrated = "https://example.invalid/migrated.png";
        let remote = read(migrated, "正文");
        let mut calls = 0;
        assert!(super::matches_with_images(&source, &remote, |image| {
            calls += 1;
            image.original_url == URL && image.original_token == "fixture-token" && image.remote_url == migrated
        }));
        assert_eq!(calls, 1);
        for broken in [read(migrated, "改正文"), "正文".into(), remote.replace("![]", "![改说明]"), format!("{remote}\n\n{remote}")] {
            assert!(!super::matches_with_images(&source, &broken, |_| panic!("must not load images before full structure passes")));
        }
        assert!(super::matches_with_images(&source, &read(URL, "正文"), |_| panic!("same URL is the fast path")));
        let second = "https://example.invalid/second.png";
        let ordered = format!("{}\n\n{}", sent(URL, "一"), sent(second, "二"));
        let swapped = format!("{}\n\n{}", read(second, "一"), read(URL, "二"));
        assert!(!super::matches_with_images(&ordered, &swapped, |image| image.original_url == image.remote_url));
    }

    #[test]
    fn pure_uploaded_images_get_one_transport_placeholder_only() {
        let image = sent(URL, "");
        for input in [image.clone(), format!("{image}\n\n{}\n", sent("https://example.invalid/second.png", ""))] {
            let prepared = prepare_for_send(&input);
            assert_eq!(prepared, format!("{input}\u{200b}"));
            assert_eq!(prepare_for_send(&prepared), prepared);
            assert_eq!(input.matches('\u{200b}').count(), 0);
        }
        for input in [
            "纯文字".into(), sent(URL, "正文"), format!("```\n{image}\n```"),
            format!("~~~\n{image}\n~~~"), format!("    {image}"), format!("\\{image}"),
            format!("![截图]({URL})"), format!("![截图]({URL}) <!-- fixture-token -->"),
            format!("![截图]({URL})<!--unknown metadata-->"), format!("{image}\u{200b}\u{200b}"),
            format!("\u{200b}{image}"), format!("{image}\u{200b}正文"),
        ] { assert_eq!(prepare_for_send(&input), input); }
    }

    #[test]
    fn pure_image_placeholder_is_not_ignored_in_other_content() {
        let image = sent(URL, "");
        let prepared = prepare_for_send(&image);
        assert!(matches(&prepared, &image));
        assert!(matches(&image, &prepared));
        let normalized = read(URL, "").trim_end_matches('\n').to_owned();
        assert!(matches(&prepared, &normalized));
        assert!(matches(&prepared, &read(URL, "\u{200b}")));
        assert!(!matches(&prepared, &read("https://example.invalid/other.png", "\u{200b}")));
        assert!(!matches(&prepared, "\u{200b}"));
        assert!(!matches(&prepared, &read(URL, "\u{200b}\u{200b}")));
        assert!(!matches(&sent(URL, "文字\u{200b}"), &read(URL, "文字")));
        assert!(!matches(&sent(URL, "\u{200b}文字"), &read(URL, "文字")));
        assert!(!matches(&prepared, &read(URL, "新正文")));
    }

    #[test]
    fn tilde_fenced_images_are_literal_code() {
        for fence in ["~~~", "~~~~~"] {
            let submitted = format!("{fence}\n{}{fence}", sent(URL, "示例文字\n"));
            let remote = format!("{fence}\n{}{fence}", read(URL, "示例文字\n"));
            assert!(!matches(&submitted, &remote), "{fence} fenced content must remain exact");
            assert!(matches(&submitted, &submitted));
        }
    }

    #[test]
    fn only_observed_image_normalization_is_equal() {
        assert!(matches(&sent(URL, "示例文字"), &read(URL, "示例文字")));
        for remote in ["示例文字".into(), read("https://example.invalid/other.png", "示例文字"), read(URL, "变更文字"), read(URL, "示例文字 "), read(URL, "示例文字\n"), read(URL, "示例文字  \n下一行")] {
            assert!(!matches(&sent(URL, "示例文字"), &remote));
        }
        assert!(!matches(&sent(URL, "硬换行  \n下一行"), &read(URL, "硬换行\n下一行")));
        assert!(!matches(&sent(URL, "    缩进代码"), &read(URL, "缩进代码")));
        assert!(!matches(&sent(URL, "`代码`"), &read(URL, "`代码`")));
        assert!(!matches(&sent(URL, "正文<!--保留注释-->"), &read(URL, "正文")));
        assert!(!matches(&sent(URL, "正文"), &read(URL, "正文").replace("![]", "![任意新说明]")));
        assert!(!matches(&sent(URL, "正文"), &read(URL, "正文").replace("image:", "arbitrary:")));
        assert!(!matches(&format!("{}\n\n{}", sent(URL, "正文"), sent("https://example.invalid/second.png", "末尾")), &format!("{}\n\n{}", read("https://example.invalid/second.png", "正文"), read(URL, "末尾"))));
        assert!(!matches(&sent(URL, "正文"), &format!("{}\n\n{}", read(URL, "正文"), read(URL, "正文"))));
    }
}
