//! 桌面配置表单与 TOML 共用校验，来源段由工作来源编辑器管理。
use super::*;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ConnectionSettings {
    pub endpoint: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_save_preserves_sources_and_validates_before_replacing_file() {
        let dir = std::env::temp_dir().join(format!(
            "fstodo-settings-{}-{}",
            std::process::id(),
            crate::sync::now_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(
            &path,
            r#"
token_file = "X:/old-token.txt"
db_path = "X:/old-cache.db"
[[source]]
id = "my-view"
kind = "view"
enabled = false
project_key = "space-a"
view_id = "view-a"
"#,
        )
        .unwrap();
        let config = Config::load(Some(&path), None).unwrap();
        let mut settings = config.connection_settings().unwrap();
        settings.endpoint = "https://example.com/mcp".into();
        config.save_connection_settings(&settings).unwrap();
        let saved = Config::load(Some(&path), None).unwrap();
        assert_eq!(saved.connection_settings().unwrap(), settings);
        assert_eq!(saved.sources.len(), 1);
        assert_eq!(saved.sources[0].id, "my-view");
        assert!(!saved.sources[0].enabled);
        assert_eq!(saved.sources[0].kind.name(), "view");
        assert_eq!(saved.db_path, PathBuf::from("X:/old-cache.db"));
        assert_eq!(saved.token_file, Some(PathBuf::from("X:/old-token.txt")));
        let before = std::fs::read(&path).unwrap();
        for invalid in ["http://example.com", ""] {
            let mut bad = settings.clone();
            bad.endpoint = invalid.into();
            assert!(saved.save_connection_settings(&bad).is_err(), "{invalid}");
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&dir).unwrap();
    }

    #[test]
    fn first_save_keeps_default_source_and_default_paths() {
        let path = std::env::temp_dir().join(format!(
            "fstodo-first-settings-{}-{}.toml",
            std::process::id(),
            crate::sync::now_ms()
        ));
        let config = Config::from_file(ConfigFile::default(), None, None, path.clone()).unwrap();
        let settings = config.connection_settings().unwrap();
        config.save_connection_settings(&settings).unwrap();
        let saved = Config::load(Some(&path), None).unwrap();
        assert_eq!(saved.connection_settings().unwrap(), settings);
        assert_eq!(saved.sources.len(), 1);
        assert_eq!(saved.sources[0].id, "personal-todo");
        std::fs::write(&path, "source = []\n").unwrap();
        let empty = Config::load(Some(&path), None).unwrap();
        empty.save_connection_settings(&settings).unwrap();
        assert!(Config::load(Some(&path), None).unwrap().sources.is_empty());
        std::fs::remove_file(&path).unwrap();
    }
}

impl Config {
    fn settings_document(&self) -> Result<(PathBuf, toml::Value), BackendError> {
        let path = self
            .loaded_from
            .as_ref()
            .unwrap_or(&self.default_config_path)
            .clone();
        let text = if path.is_file() {
            std::fs::read_to_string(&path)
                .map_err(|e| BackendError::config(format!("读取配置失败: {e}")))?
        } else {
            String::new()
        };
        let value = toml::from_str(&text)
            .map_err(|e| BackendError::config(format!("读取配置失败: {e}")))?;
        Ok((path, value))
    }

    /// 桌面只接收连接地址，请求策略由系统调度。
    pub fn connection_settings(&self) -> Result<ConnectionSettings, BackendError> {
        let (path, value) = self.settings_document()?;
        let file = parse_toml(
            &toml::to_string(&value).map_err(|e| BackendError::config(e.to_string()))?,
            &path,
        )?;
        Ok(ConnectionSettings {
            endpoint: file.endpoint,
        })
    }

    fn settings_update(
        &self,
        settings: &ConnectionSettings,
    ) -> Result<(PathBuf, String, Config), BackendError> {
        let (path, mut value) = self.settings_document()?;
        let table = value
            .as_table_mut()
            .ok_or_else(|| BackendError::config("配置根节点不是表"))?;
        // 首次创建配置也要落盘内置来源；已有文件中缺少来源则保持其空范围。
        if !path.is_file() {
            let sources = ConfigFile::default()
                .source
                .iter()
                .map(toml::Value::try_from)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| BackendError::config(e.to_string()))?;
            table.insert("source".into(), toml::Value::Array(sources));
        }
        // 隐藏的旧配置保持原值，避免自动保存时切换数据库或丢失凭证来源。
        let encoded =
            toml::Value::try_from(settings).map_err(|e| BackendError::config(e.to_string()))?;
        table.extend(
            encoded
                .as_table()
                .ok_or_else(|| BackendError::config("设置不是表"))?
                .clone(),
        );
        let text =
            toml::to_string_pretty(&value).map_err(|e| BackendError::config(e.to_string()))?;
        let config = Self::from_file(
            parse_toml(&text, &path)?,
            Some(path.clone()),
            None,
            self.default_config_path.clone(),
        )?;
        Ok((path, text, config))
    }

    /// 允许调用方在落盘前检查目标缓存是否可用。
    pub fn preview_connection_settings(
        &self,
        settings: &ConnectionSettings,
    ) -> Result<Config, BackendError> {
        self.settings_update(settings).map(|(_, _, config)| config)
    }

    pub fn save_connection_settings(
        &self,
        settings: &ConnectionSettings,
    ) -> Result<(), BackendError> {
        let (path, text, _) = self.settings_update(settings)?;
        paths::ensure_parent_dir(&path)?;
        let temporary = path.with_extension(format!("{}.settings.tmp", std::process::id()));
        std::fs::write(&temporary, text)
            .map_err(|e| BackendError::config(format!("保存配置失败: {e}")))?;
        std::fs::rename(&temporary, &path)
            .map_err(|e| BackendError::config(format!("替换配置失败: {e}")))?;
        Ok(())
    }
}
