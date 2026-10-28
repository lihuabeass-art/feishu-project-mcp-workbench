//! 来源目录、固定内置规则及来源配置的持久化。
use super::*;

pub(super) fn builtin_source(
    key: &str,
    id: &str,
    project: Option<String>,
) -> Result<SourceTable, BackendError> {
    let mut source = SourceTable {
        id: id.into(),
        enabled: true,
        builtin_key: Some(key.into()),
        ..Default::default()
    };
    match key {
        "todo" | "overdue" | "week" | "upcoming" => {
            source.kind = "personal_todo".into();
            source.action = Some(
                match key {
                    "overdue" => "overdue",
                    "week" => "this_week",
                    _ => "todo",
                }
                .into(),
            );
            source.todo_scope = Some(
                match key {
                    "todo" => "in_progress",
                    "upcoming" => "not_started",
                    _ => "all",
                }
                .into(),
            );
        }
        "stories" | "issues" => {
            source.kind = "work_item_type".into();
            source.project_key = project;
            source.work_item_type_key =
                Some(if key == "stories" { "story" } else { "issue" }.into());
            source.association_rule = Some(r#"{"kind":"all_participants"}"#.into());
        }
        _ => return Err(BackendError::validation("未知的内置工作来源")),
    }
    Ok(source)
}

impl SourceTable {
    /// 只识别旧版本固定 ID 和完全一致的规则，避免把用户自定义来源误锁定。
    pub fn resolved_builtin_key(&self) -> Option<&str> {
        if let Some(key) = self.builtin_key.as_deref() {
            return Some(key);
        }
        if self.display_name.is_some() {
            return None;
        }
        let key = match self.id.as_str() {
            "personal-todo" => "todo",
            "related-story" => "stories",
            _ => return None,
        };
        let expected = builtin_source(key, &self.id, self.project_key.clone()).ok()?;
        same_rules(self, &expected).then_some(key)
    }
}

fn same_rules(a: &SourceTable, b: &SourceTable) -> bool {
    let rule = |s: &SourceTable| {
        s.association_rule
            .as_deref()
            .map(|v| v.split_whitespace().collect::<String>())
    };
    a.kind == b.kind
        && a.action == b.action
        && a.todo_scope == b.todo_scope
        && a.work_item_type_key == b.work_item_type_key
        && a.view_id == b.view_id
        && a.asset_key == b.asset_key
        && rule(a) == rule(b)
}

pub(super) fn validate_builtin(source: &SourceTable) -> Result<(), BackendError> {
    if let Some(key) = source.builtin_key.as_deref() {
        let expected = builtin_source(key, &source.id, source.project_key.clone())?;
        if !same_rules(source, &expected)
            || source.display_name.is_some()
            || (source.kind == "personal_todo" && source.project_key.is_some())
        {
            return Err(BackendError::validation(
                "内置来源的名称与查询规则不可修改，请添加自定义来源",
            ));
        }
    }
    Ok(())
}

impl Config {
    fn source_document(&self) -> Result<(PathBuf, toml::Value, Vec<SourceTable>), BackendError> {
        let path = self
            .loaded_from
            .as_ref()
            .unwrap_or(&self.default_config_path)
            .clone();
        let original = if path.is_file() {
            std::fs::read_to_string(&path).map_err(|e| BackendError::config(e.to_string()))?
        } else {
            String::new()
        };
        let value: toml::Value = toml::from_str(&original)
            .map_err(|e| BackendError::config(format!("读取来源配置失败: {e}")))?;
        let sources = if path.is_file() {
            parse_toml(&original, &path)?.source
        } else {
            ConfigFile::default().source
        };
        Ok((path, value, sources))
    }

    pub fn source_tables(&self) -> Result<Vec<SourceTable>, BackendError> {
        self.source_document().map(|(_, _, sources)| sources)
    }

    fn update_sources(
        &self,
        update: impl FnOnce(&mut Vec<SourceTable>) -> Result<(), BackendError>,
    ) -> Result<(), BackendError> {
        let (path, mut value, mut sources) = self.source_document()?;
        update(&mut sources)?;
        let encoded = sources
            .iter()
            .map(toml::Value::try_from)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| BackendError::config(e.to_string()))?;
        value
            .as_table_mut()
            .ok_or_else(|| BackendError::config("配置根节点不是表"))?
            .insert("source".into(), toml::Value::Array(encoded));
        let text =
            toml::to_string_pretty(&value).map_err(|e| BackendError::config(e.to_string()))?;
        Self::from_file(
            parse_toml(&text, &path)?,
            Some(path.clone()),
            None,
            self.default_config_path.clone(),
        )?;
        paths::ensure_parent_dir(&path)?;
        let temporary = path.with_extension(format!("{}.sources.tmp", std::process::id()));
        std::fs::write(&temporary, text)
            .map_err(|e| BackendError::config(format!("保存来源失败: {e}")))?;
        std::fs::rename(&temporary, &path)
            .map_err(|e| BackendError::config(format!("替换来源配置失败: {e}")))?;
        Ok(())
    }

    pub fn save_source(&self, mut input: SourceTable) -> Result<(), BackendError> {
        input.id = input.id.trim().into();
        input.display_name = opt_str(&input.display_name);
        input.project_key = opt_str(&input.project_key);
        let source = build_source(input.clone())?;
        source.ensure_executable()?;
        self.update_sources(|sources| {
            if let Some(key) = input.builtin_key.as_deref() {
                if sources.iter().any(|s| {
                    s.id != input.id
                        && s.resolved_builtin_key() == Some(key)
                        && (input.kind == "personal_todo"
                            || opt_str(&s.project_key) == input.project_key)
                }) {
                    return Err(BackendError::validation(if input.kind == "personal_todo" {
                        "此内置来源已经添加"
                    } else {
                        "此空间已添加相同的内置来源，请选择其他空间"
                    }));
                }
            }
            if let Some(existing) = sources.iter_mut().find(|s| s.id == input.id) {
                if let Some(key) = existing.resolved_builtin_key() {
                    // 首次绑定空间仅补齐查询目标，不允许更换既有内置规则或已绑定空间。
                    if existing.project_key.is_some()
                        || existing.kind != "work_item_type"
                        || input.builtin_key.as_deref() != Some(key)
                        || !same_rules(existing, &input)
                    {
                        return Err(BackendError::validation(
                            "内置来源不可编辑；如需调整规则，请添加自定义来源",
                        ));
                    }
                } else if input.builtin_key.is_some() {
                    return Err(BackendError::validation("自定义来源不能改为内置来源"));
                }
                *existing = input;
            } else {
                sources.push(input);
            }
            Ok(())
        })
    }

    pub fn remove_source(&self, id: &str) -> Result<(), BackendError> {
        self.update_sources(|sources| {
            let index = sources
                .iter()
                .position(|s| s.id == id)
                .ok_or_else(|| BackendError::validation("工作来源已不存在"))?;
            sources.remove(index);
            Ok(())
        })
    }

    pub fn set_source_enabled(&self, id: &str, enabled: bool) -> Result<(), BackendError> {
        self.update_sources(|sources| {
            let source = sources
                .iter_mut()
                .find(|s| s.id == id)
                .ok_or_else(|| BackendError::validation("工作来源已不存在"))?;
            source.enabled = enabled;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (Config, PathBuf) {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "fstodo-sources-{}-{}-{}.toml",
            std::process::id(),
            crate::sync::now_ms(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        // 显式模拟旧版预置的未绑定需求来源，验证升级后仍可管理原配置。
        let mut file = ConfigFile::default();
        file.source
            .push(builtin_source("stories", "related-story", None).unwrap());
        let document = toml::Table::from_iter([(
            "source".into(),
            toml::Value::try_from(&file.source).unwrap(),
        )]);
        std::fs::write(&path, toml::to_string(&document).unwrap()).unwrap();
        let config = Config::load(Some(&path), None).unwrap();
        (config, path)
    }

    #[test]
    fn removal_persists_empty_sources_and_allows_readding_builtin() {
        let (config, path) = fixture();
        config.remove_source("personal-todo").unwrap();
        config.remove_source("related-story").unwrap();
        assert!(Config::load(Some(&path), None).unwrap().sources.is_empty());
        config
            .save_source(builtin_source("todo", "builtin-todo", None).unwrap())
            .unwrap();
        let reloaded = Config::load(Some(&path), None).unwrap();
        assert_eq!(reloaded.sources.len(), 1);
        assert_eq!(
            reloaded.source_tables().unwrap()[0].resolved_builtin_key(),
            Some("todo")
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn builtin_rules_are_locked_but_pending_space_can_be_bound_once() {
        let (config, path) = fixture();
        let original = std::fs::read(&path).unwrap();
        let mut todo = builtin_source("todo", "personal-todo", None).unwrap();
        todo.todo_scope = Some("all".into());
        assert!(config.save_source(todo).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let story = builtin_source("stories", "related-story", Some("space-a".into())).unwrap();
        config.save_source(story.clone()).unwrap();
        assert!(Config::load(Some(&path), None).unwrap().sources[1]
            .ensure_executable()
            .is_ok());
        let mut moved = story;
        moved.project_key = Some("space-b".into());
        let before = std::fs::read(&path).unwrap();
        assert!(config.save_source(moved).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        config.set_source_enabled("related-story", false).unwrap();
        assert!(!Config::load(Some(&path), None).unwrap().sources[1].enabled);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn space_builtins_can_repeat_across_spaces_but_not_within_the_same_space() {
        let (config, path) = fixture();
        for key in ["stories", "issues"] {
            for project in ["space-a", "space-b"] {
                config
                    .save_source(
                        builtin_source(key, &format!("{key}-{project}"), Some(project.into()))
                            .unwrap(),
                    )
                    .unwrap();
            }
            let before = std::fs::read(&path).unwrap();
            let duplicate =
                builtin_source(key, &format!("{key}-duplicate"), Some(" space-a ".into())).unwrap();
            assert!(config
                .save_source(duplicate)
                .unwrap_err()
                .to_string()
                .contains("此空间已添加"));
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
        let before = std::fs::read(&path).unwrap();
        // 旧版未绑定来源不能再绑定到已存在相同来源的空间。
        let legacy = builtin_source("stories", "related-story", Some("space-a".into())).unwrap();
        assert!(config.save_source(legacy).is_err());
        assert!(config
            .save_source(builtin_source("todo", "another-todo", None).unwrap())
            .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let loaded = Config::load(Some(&path), None).unwrap();
        assert_eq!(loaded.sources.len(), 6);
        config.remove_source("stories-space-a").unwrap();
        let remaining = Config::load(Some(&path), None).unwrap();
        assert!(remaining.sources.iter().any(|s| s.id == "stories-space-b"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn custom_rename_keeps_identity_and_unrelated_configuration() {
        let (config, path) = fixture();
        std::fs::write(
            &path,
            "token_file = 'X:/secret.txt'\ndb_path = 'X:/cache.db'\nsource = []\n",
        )
        .unwrap();
        let mut custom = SourceTable {
            id: "custom-1".into(),
            kind: "view".into(),
            enabled: true,
            project_key: Some("space-a".into()),
            view_id: Some("view-1".into()),
            ..Default::default()
        };
        config.save_source(custom.clone()).unwrap();
        custom.display_name = Some("新的名称".into());
        custom.view_id = Some("view-2".into());
        custom.enabled = false;
        config.save_source(custom).unwrap();
        let reloaded = Config::load(Some(&path), None).unwrap();
        assert_eq!(reloaded.sources.len(), 1);
        let saved = &reloaded.source_tables().unwrap()[0];
        assert_eq!(saved.id, "custom-1");
        assert_eq!(saved.display_name.as_deref(), Some("新的名称"));
        assert_eq!(saved.view_id.as_deref(), Some("view-2"));
        assert_eq!(reloaded.token_file, Some(PathBuf::from("X:/secret.txt")));
        assert_eq!(reloaded.db_path, PathBuf::from("X:/cache.db"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn new_custom_source_with_legacy_id_remains_editable() {
        let (config, path) = fixture();
        config.remove_source("related-story").unwrap();
        let mut custom =
            builtin_source("stories", "related-story", Some("space-a".into())).unwrap();
        custom.builtin_key = None;
        custom.display_name = Some("related-story".into());
        config.save_source(custom.clone()).unwrap();
        let tables = config.source_tables().unwrap();
        assert!(tables
            .iter()
            .find(|s| s.id == "related-story")
            .unwrap()
            .resolved_builtin_key()
            .is_none());
        custom.display_name = Some("重命名需求".into());
        config.save_source(custom).unwrap();
        std::fs::remove_file(path).unwrap();
    }
}
