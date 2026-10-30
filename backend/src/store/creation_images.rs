//! 创建草稿中的截图随 SQLite 持久化，不依赖浏览器内存或临时文件。
use super::{params, BackendError, OptionalExtension, Store};

pub(super) const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS creation_image (
    context TEXT NOT NULL, project_key TEXT NOT NULL, type_key TEXT NOT NULL,
    field_key TEXT NOT NULL, image_id TEXT NOT NULL, mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL, bytes BLOB NOT NULL, uploaded_url TEXT, uploaded_token TEXT,
    PRIMARY KEY(context,project_key,type_key,field_key,image_id));";

pub(crate) struct CreationImageKey<'a> {
    pub context: &'a str,
    pub project_key: &'a str,
    pub type_key: &'a str,
    pub field_key: &'a str,
    pub image_id: &'a str,
}

pub(crate) struct CreationImage {
    pub mime_type: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub uploaded_url: Option<String>,
    pub uploaded_token: Option<String>,
}

pub(crate) struct UploadedCreationImageKey<'a> {
    pub context: &'a str,
    pub project_key: &'a str,
    pub type_key: &'a str,
    pub field_key: &'a str,
    pub url: &'a str,
    pub file_token: &'a str,
}

impl Store {
    pub(crate) fn save_creation_image(
        &self,
        key: &CreationImageKey<'_>,
        image: &CreationImage,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        // 同一截图再次粘贴时保留既有上传结果，避免覆盖成“待上传”。
        conn.execute(
            "INSERT OR IGNORE INTO creation_image
            (context,project_key,type_key,field_key,image_id,mime_type,file_name,bytes,uploaded_url,uploaded_token)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL)",
            params![
                key.context,
                key.project_key,
                key.type_key,
                key.field_key,
                key.image_id,
                image.mime_type,
                image.file_name,
                image.bytes
            ],
        )?;
        Ok(())
    }

    pub(crate) fn creation_image(
        &self,
        key: &CreationImageKey<'_>,
    ) -> Result<Option<CreationImage>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        Ok(conn
            .query_row(
                "SELECT mime_type,file_name,bytes,uploaded_url,uploaded_token FROM creation_image
            WHERE context=?1 AND project_key=?2 AND type_key=?3 AND field_key=?4 AND image_id=?5",
                params![
                    key.context,
                    key.project_key,
                    key.type_key,
                    key.field_key,
                    key.image_id
                ],
                |row| {
                    Ok(CreationImage {
                        mime_type: row.get(0)?,
                        file_name: row.get(1)?,
                        bytes: row.get(2)?,
                        uploaded_url: row.get(3)?,
                        uploaded_token: row.get(4)?,
                    })
                },
            )
            .optional()?)
    }

    pub(crate) fn uploaded_creation_image(
        &self,
        key: &UploadedCreationImageKey<'_>,
    ) -> Result<Option<(String, CreationImage)>, BackendError> {
        let conn = self.conn.lock().expect("store mutex poisoned");
        Ok(conn
            .query_row(
                "SELECT image_id,mime_type,file_name,bytes,uploaded_url,uploaded_token FROM creation_image
            WHERE context=?1 AND project_key=?2 AND type_key=?3 AND field_key=?4 AND uploaded_url=?5 AND uploaded_token=?6
            ORDER BY image_id LIMIT 1",
                params![key.context, key.project_key, key.type_key, key.field_key, key.url, key.file_token],
                |row| {
                    Ok((row.get(0)?, CreationImage {
                        mime_type: row.get(1)?,
                        file_name: row.get(2)?,
                        bytes: row.get(3)?,
                        uploaded_url: row.get(4)?,
                        uploaded_token: row.get(5)?,
                    }))
                },
            )
            .optional()?)
    }

    pub(crate) fn mark_creation_image_uploaded(
        &self,
        key: &CreationImageKey<'_>,
        url: &str,
        file_token: &str,
    ) -> Result<(), BackendError> {
        let changed = self.conn.lock().expect("store mutex poisoned").execute(
            "UPDATE creation_image SET uploaded_url=?6,uploaded_token=?7 WHERE context=?1 AND project_key=?2 AND type_key=?3 AND field_key=?4 AND image_id=?5",
            params![key.context,key.project_key,key.type_key,key.field_key,key.image_id,url,file_token])?;
        if changed != 1 {
            return Err(BackendError::unknown_result(
                "图片可能已上传，但本机未能保存结果；原图和草稿仍保留，请先核对后再处理",
            ));
        }
        Ok(())
    }
}
