use std::collections::HashMap;
use std::sync::Arc;
use futures_util::future::{AbortHandle, Abortable};
use futures_util::stream::StreamExt;
use bollard::container::LogOutput;
use bollard::models::ContainerCreateBody;
use bollard::query_parameters::{
    CreateContainerOptionsBuilder, CreateImageOptionsBuilder, ListContainersOptionsBuilder,
    LogsOptionsBuilder, RemoveContainerOptionsBuilder, RestartContainerOptionsBuilder,
    StopContainerOptionsBuilder,
};
use bollard::Docker;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::ipc::Channel;
use tauri::State;

#[derive(Clone, Default)]
pub struct DockerSessions(pub Arc<Mutex<HashMap<String, AbortHandle>>>);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatusJson {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSummaryJson {
    pub container_id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created_at: i64,
    pub host_ports: Vec<u16>,
    pub persists: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortMappingJson {
    pub host_port: u16,
    pub container_port: u16,
    pub protocol: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MountInfoJson {
    #[serde(rename = "type")]
    pub mount_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub source: String,
    pub destination: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerDetailJson {
    pub container_id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created_at: i64,
    pub host_ports: Vec<u16>,
    pub persists: bool,
    pub env: Vec<String>,
    pub mounts: Vec<MountInfoJson>,
    pub networks: Vec<String>,
    pub restart_policy: String,
    pub persist_volume: bool,
}

pub fn is_localstack_image(image: &str) -> bool {
    let raw = image.trim();
    let without_registry = if let Some((first_segment, rest)) = raw.split_once('/') {
        if first_segment.contains('.') || first_segment.contains(':') || first_segment == "localhost" {
            rest
        } else {
            raw
        }
    } else {
        raw
    };

    without_registry.starts_with("localstack/localstack")
        || without_registry.starts_with("gresau/localstack-persist")
}

pub fn is_persist_image(image: &str) -> bool {
    let raw = image.trim();
    let without_registry = if let Some((first_segment, rest)) = raw.split_once('/') {
        if first_segment.contains('.') || first_segment.contains(':') || first_segment == "localhost" {
            rest
        } else {
            raw
        }
    } else {
        raw
    };

    without_registry.starts_with("gresau/localstack-persist")
}

pub fn is_persist_mount_destination(dest: &str) -> bool {
    dest == "/var/lib/localstack" || dest == "/persisted-data"
}

pub async fn docker_client() -> Result<Docker, String> {
    Docker::connect_with_local_defaults().map_err(|e| {
        let msg = e.to_string();
        let lower = msg.to_lowercase();
        if lower.contains("permission denied") || lower.contains("eacces") {
            format!("permission denied: {}", msg)
        } else {
            msg
        }
    })
}

#[tauri::command]
pub async fn docker_status() -> Result<DockerStatusJson, String> {
    let docker = match docker_client().await {
        Ok(d) => d,
        Err(e) => {
            let lower = e.to_lowercase();
            let error_kind = if lower.contains("permission denied") {
                "permission"
            } else {
                "unavailable"
            };
            return Ok(DockerStatusJson {
                available: false,
                error_kind: Some(error_kind.to_string()),
                reason: Some(e),
                version: None,
            });
        }
    };

    match docker.version().await {
        Ok(v) => Ok(DockerStatusJson {
            available: true,
            error_kind: None,
            reason: None,
            version: v.version,
        }),
        Err(e) => {
            let msg = e.to_string();
            let lower = msg.to_lowercase();
            let error_kind = if lower.contains("permission denied") {
                "permission"
            } else {
                "unavailable"
            };
            Ok(DockerStatusJson {
                available: false,
                error_kind: Some(error_kind.to_string()),
                reason: Some(msg),
                version: None,
            })
        }
    }
}

#[tauri::command]
pub async fn docker_list_containers() -> Result<Vec<ContainerSummaryJson>, String> {
    let docker = docker_client().await?;
    let opts = ListContainersOptionsBuilder::default()
        .all(true)
        .build();
    let containers = docker.list_containers(Some(opts)).await.map_err(|e| e.to_string())?;

    let mut summaries = Vec::new();
    for c in containers {
        let image = c.image.clone().unwrap_or_default();
        if !is_localstack_image(&image) {
            continue;
        }
        let container_id = c.id.clone().unwrap_or_default();
        let name = c.names.and_then(|names| names.into_iter().next())
            .map(|n| n.trim_start_matches('/').to_string())
            .unwrap_or_else(|| container_id[..12.min(container_id.len())].to_string());
        let state = c.state.map(|s| s.to_string().to_lowercase()).unwrap_or_else(|| "unknown".to_string());
        let status = c.status.unwrap_or_default();
        let created_at = c.created.unwrap_or(0);
        let mut host_ports: Vec<u16> = c.ports.unwrap_or_default()
            .into_iter()
            .filter_map(|p| p.public_port)
            .collect();
        host_ports.sort_unstable();
        host_ports.dedup();

        let persists = is_persist_image(&image);

        summaries.push(ContainerSummaryJson {
            container_id,
            name,
            image,
            state,
            status,
            created_at,
            host_ports,
            persists,
        });
    }

    Ok(summaries)
}

#[tauri::command]
pub async fn docker_inspect_container(container_id: String) -> Result<ContainerDetailJson, String> {
    let docker = docker_client().await?;
    let inspect = docker.inspect_container(&container_id, None).await.map_err(|e| e.to_string())?;

    let id = inspect.id.clone().unwrap_or(container_id);
    let name = inspect.name.as_deref().map(|n| n.trim_start_matches('/')).unwrap_or("").to_string();
    let image = inspect.config.as_ref().and_then(|c| c.image.clone()).unwrap_or_default();
    let persists = is_persist_image(&image);

    let state = inspect.state.as_ref()
        .and_then(|s| s.status)
        .map(|s| s.to_string().to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());
    let status = inspect.state.as_ref()
        .and_then(|s| s.status.map(|st| st.to_string()))
        .unwrap_or_else(|| state.clone());

    let created_at = inspect.created.as_deref().and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.timestamp())
    }).unwrap_or(0);

    let env = inspect.config.as_ref().and_then(|c| c.env.clone()).unwrap_or_default();

    let mut host_ports: Vec<u16> = Vec::new();
    let mut networks: Vec<String> = Vec::new();

    if let Some(ns) = &inspect.network_settings {
        if let Some(ports) = &ns.ports {
            for (_k, v) in ports {
                if let Some(bindings) = v {
                    for b in bindings {
                        if let Some(hp) = &b.host_port {
                            if let Ok(p) = hp.parse::<u16>() {
                                host_ports.push(p);
                            }
                        }
                    }
                }
            }
        }
        if let Some(nets) = &ns.networks {
            for (net_name, _) in nets {
                networks.push(net_name.clone());
            }
        }
    }
    host_ports.sort_unstable();
    host_ports.dedup();
    networks.sort();

    let restart_policy = inspect.host_config.as_ref()
        .and_then(|hc| hc.restart_policy.as_ref())
        .and_then(|rp| rp.name)
        .map(|n| n.to_string().to_lowercase())
        .unwrap_or_else(|| "no".to_string());

    let mut mounts = Vec::new();
    if let Some(raw_mounts) = inspect.mounts {
        for m in raw_mounts {
            let mount_type = m.typ.map(|t| t.to_string().to_lowercase()).unwrap_or_else(|| "volume".to_string());
            let source = m.source.unwrap_or_default();
            let destination = m.destination.unwrap_or_default();
            mounts.push(MountInfoJson {
                mount_type,
                name: m.name,
                source,
                destination,
            });
        }
    }

    let persist_volume = mounts.iter().any(|m| is_persist_mount_destination(&m.destination));

    Ok(ContainerDetailJson {
        container_id: id,
        name,
        image,
        state,
        status,
        created_at,
        host_ports,
        persists,
        env,
        mounts,
        networks,
        restart_policy,
        persist_volume,
    })
}

#[tauri::command]
pub async fn docker_start_container(container_id: String) -> Result<(), String> {
    let docker = docker_client().await?;
    docker
        .start_container(&container_id, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_stop_container(container_id: String, timeout_secs: u32) -> Result<(), String> {
    let docker = docker_client().await?;
    let opts = StopContainerOptionsBuilder::default()
        .t(timeout_secs as i32)
        .build();
    docker
        .stop_container(&container_id, Some(opts))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_restart_container(container_id: String, timeout_secs: u32) -> Result<(), String> {
    let docker = docker_client().await?;
    let opts = RestartContainerOptionsBuilder::default()
        .t(timeout_secs as i32)
        .build();
    docker
        .restart_container(&container_id, Some(opts))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_remove_container(container_id: String, remove_volumes: bool) -> Result<(), String> {
    let docker = docker_client().await?;
    let opts = RemoveContainerOptionsBuilder::default()
        .v(remove_volumes)
        .force(true)
        .build();
    docker
        .remove_container(&container_id, Some(opts))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_cancel(
    session_id: String,
    sessions: State<'_, DockerSessions>,
) -> Result<(), String> {
    if let Some(handle) = sessions.0.lock().remove(&session_id) {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn docker_create_container(
    container_name: Option<String>,
    config: serde_json::Value,
    session_id: String,
    on_event: Channel<serde_json::Value>,
    sessions: State<'_, DockerSessions>,
) -> Result<ContainerSummaryJson, String> {
    let docker = docker_client().await?;
    let image_str = config
        .get("Image")
        .and_then(|v| v.as_str())
        .unwrap_or("localstack/localstack:4.14.0")
        .to_string();

    // Check if image exists locally
    let needs_pull = docker.inspect_image(&image_str).await.is_err();

    if needs_pull {
        let (abort_handle, abort_registration) = AbortHandle::new_pair();
        sessions.0.lock().insert(session_id.clone(), abort_handle);

        let pull_opts = CreateImageOptionsBuilder::default()
            .from_image(image_str.as_str())
            .build();
        let stream = docker.create_image(Some(pull_opts), None, None);
        let mut abortable_stream = Abortable::new(stream, abort_registration);

        let mut pulled_any = false;
        while let Some(item_res) = abortable_stream.next().await {
            pulled_any = true;
            match item_res {
                Ok(info) => {
                    let status = info.status.unwrap_or_default();
                    let layer_id = info.id;
                    let (current, total) = match info.progress_detail {
                        Some(pd) => (pd.current.map(|c| c as u64), pd.total.map(|t| t as u64)),
                        None => (None, None),
                    };
                    let error = info.error_detail.and_then(|e| e.message);
                    let event = json!({
                        "status": status,
                        "layerId": layer_id,
                        "current": current,
                        "total": total,
                        "done": false,
                        "error": error
                    });
                    let _ = on_event.send(event);
                    if let Some(err) = error {
                        sessions.0.lock().remove(&session_id);
                        return Err(err);
                    }
                }
                Err(e) => {
                    sessions.0.lock().remove(&session_id);
                    return Err(e.to_string());
                }
            }
        }
        sessions.0.lock().remove(&session_id);
        if !pulled_any {
            return Err("Image pull cancelled or failed to start".to_string());
        }
    }

    let _ = on_event.send(json!({
        "status": "Creating container…",
        "done": false
    }));

    let body: ContainerCreateBody = serde_json::from_value(config)
        .map_err(|e| format!("Invalid container create config: {}", e))?;

    let mut create_builder = CreateContainerOptionsBuilder::default();
    if let Some(name) = &container_name {
        create_builder = create_builder.name(name.as_str());
    }

    let create_res = docker
        .create_container(Some(create_builder.build()), body)
        .await
        .map_err(|e| e.to_string())?;

    let container_id = create_res.id;

    let _ = on_event.send(json!({
        "status": "Starting container…",
        "done": false
    }));

    docker
        .start_container(&container_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let _ = on_event.send(json!({
        "status": "Container started",
        "done": true
    }));

    // Build and return container summary
    let detail = docker_inspect_container(container_id.clone()).await?;

    Ok(ContainerSummaryJson {
        container_id: detail.container_id,
        name: detail.name,
        image: detail.image,
        state: detail.state,
        status: detail.status,
        created_at: detail.created_at,
        host_ports: detail.host_ports,
        persists: detail.persists,
    })
}

#[tauri::command]
pub async fn docker_container_logs(
    session_id: String,
    container_id: String,
    tail: u32,
    on_event: Channel<serde_json::Value>,
    sessions: State<'_, DockerSessions>,
) -> Result<(), String> {
    let docker = docker_client().await?;
    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    sessions.0.lock().insert(session_id.clone(), abort_handle);

    let tail_str = if tail == 0 {
        "all".to_string()
    } else {
        tail.to_string()
    };
    let logs_opts = LogsOptionsBuilder::default()
        .follow(true)
        .stdout(true)
        .stderr(true)
        .timestamps(false)
        .tail(tail_str.as_str())
        .build();

    let stream = docker.logs(&container_id, Some(logs_opts));
    let session_id_clone = session_id.clone();
    let sessions_clone = sessions.inner().0.clone();

    tauri::async_runtime::spawn(async move {
        let mut abortable_stream = Abortable::new(stream, abort_registration);
        let mut batch = Vec::new();

        while let Some(item_res) = abortable_stream.next().await {
            match item_res {
                Ok(item) => {
                    let text = match item {
                        LogOutput::StdOut { message } => String::from_utf8_lossy(&message).to_string(),
                        LogOutput::StdErr { message } => String::from_utf8_lossy(&message).to_string(),
                        LogOutput::Console { message } => String::from_utf8_lossy(&message).to_string(),
                        LogOutput::StdIn { message } => String::from_utf8_lossy(&message).to_string(),
                    };
                    for line in text.lines() {
                        batch.push(line.to_string());
                    }
                    if !batch.is_empty() {
                        let _ = on_event.send(json!({ "type": "log", "lines": batch }));
                        batch = Vec::new();
                    }
                }
                _ => break,
            }
        }
        sessions_clone.lock().remove(&session_id_clone);
    });

    Ok(())
}

#[tauri::command]
pub async fn docker_stop_logs(
    session_id: String,
    sessions: State<'_, DockerSessions>,
) -> Result<(), String> {
    if let Some(handle) = sessions.0.lock().remove(&session_id) {
        handle.abort();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_localstack_image() {
        assert!(is_localstack_image("localstack/localstack"));
        assert!(is_localstack_image("localstack/localstack:4.14.0"));
        assert!(is_localstack_image("localstack/localstack:latest"));
        assert!(is_localstack_image("docker.io/localstack/localstack:4.14.0"));
        assert!(is_localstack_image("registry.host.com:5000/localstack/localstack:latest"));
        assert!(is_localstack_image("gresau/localstack-persist:latest"));
        assert!(is_localstack_image("gresau/localstack-persist"));
        assert!(is_localstack_image("my-registry.io/gresau/localstack-persist:v1"));

        assert!(!is_localstack_image("redis:7"));
        assert!(!is_localstack_image("alpine:latest"));
        assert!(!is_localstack_image("localstack/other-tool"));
        assert!(!is_localstack_image(""));
    }

    #[test]
    fn test_is_persist_mount_destination() {
        assert!(is_persist_mount_destination("/var/lib/localstack"));
        assert!(is_persist_mount_destination("/persisted-data"));
        assert!(!is_persist_mount_destination("/other/dir"));
        assert!(!is_persist_mount_destination(""));
    }

    #[tokio::test]
    async fn container_lifecycle_roundtrip() {
        let Ok(docker) = Docker::connect_with_local_defaults() else {
            eprintln!("skip: no docker daemon");
            return;
        };
        if docker.version().await.is_err() {
            eprintln!("skip: no docker daemon");
            return;
        }

        let pull_opts = CreateImageOptionsBuilder::default()
            .from_image("hello-world:latest")
            .build();
        let mut pull_stream = docker.create_image(Some(pull_opts), None, None);
        while let Some(res) = pull_stream.next().await {
            if res.is_err() {
                eprintln!("skip: failed to pull hello-world");
                return;
            }
        }

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let name = format!("localstacker-rust-test-{}", ts);

        let create_opts = CreateContainerOptionsBuilder::default()
            .name(&name)
            .build();
        let body = ContainerCreateBody {
            image: Some("hello-world:latest".to_string()),
            ..Default::default()
        };

        let created = docker.create_container(Some(create_opts), body).await;
        let Ok(create_res) = created else {
            eprintln!("skip: failed to create test container");
            return;
        };
        let container_id = create_res.id;

        let _ = docker.start_container(&container_id, None).await;

        let list_opts = ListContainersOptionsBuilder::default().all(true).build();
        let containers = docker.list_containers(Some(list_opts)).await.unwrap_or_default();
        let found = containers.iter().any(|c| {
            c.names
                .as_ref()
                .map(|names| names.iter().any(|n| n.contains(&name)))
                .unwrap_or(false)
        });
        assert!(found, "Expected container {} to be found in raw list", name);

        let stop_opts = StopContainerOptionsBuilder::default().t(10).build();
        let _ = docker.stop_container(&container_id, Some(stop_opts)).await;

        let remove_opts = RemoveContainerOptionsBuilder::default().force(true).v(true).build();
        let _ = docker.remove_container(&container_id, Some(remove_opts)).await;
    }
}
