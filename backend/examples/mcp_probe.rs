//! 只读原始探针（长期保留）：按真实凭据调用一个**读侧**工具，把服务端原始 JSON 打到 stdout。
//!
//! 走的是 `Session::call_read_tool`，写侧工具在门面层就被拒绝，所以这个探针**发不出写请求**；
//! 留着是为了随时复核接口事实（分页形状、字段名、数字/字符串类型），不必依赖推断或样本。
//! 退出码沿用 `ErrorKind::exit_code()`，脚本可直接判定是哪一类失败。
//!
//! 用法：
//!   cargo run --example mcp_probe -- <tool> <参数 JSON 或 参数文件路径>

use std::io::Read;

use fstodo_backend::api::Session;
use fstodo_backend::config::Config;
use serde_json::{Map, Value};

fn main() {
    let mut argv = std::env::args().skip(1);
    let Some(tool) = argv.next() else {
        eprintln!("用法: mcp_probe <tool> <参数 JSON 或 参数文件路径>");
        std::process::exit(2);
    };
    let raw = match argv.next() {
        Some(arg) => {
            if std::path::Path::new(&arg).is_file() {
                let mut buf = String::new();
                std::fs::File::open(&arg).unwrap().read_to_string(&mut buf).unwrap();
                buf
            } else {
                arg
            }
        }
        None => "{}".to_string(),
    };
    // Windows PowerShell 的 Set-Content 会写 BOM，读回来要先剥掉
    let args: Map<String, Value> =
        serde_json::from_str(raw.trim_start_matches('\u{feff}')).expect("参数必须是 JSON 对象");

    let config = Config::load(None, None).unwrap();
    let session = Session::open(config).unwrap();
    match session.call_read_tool(&tool, &args) {
        Ok(value) => println!("{}", serde_json::to_string_pretty(&value).unwrap()),
        Err(e) => {
            eprintln!("调用失败 [{}]: {}", e.kind().as_str(), e.safe_message(None));
            std::process::exit(e.kind().exit_code());
        }
    }
}
