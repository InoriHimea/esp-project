# GitHub Actions 工作流程說明

本專案使用 GitHub Actions 實現自動化 CI/CD 流程。

## 📋 工作流程概覽

### 1. CI Workflow (`ci.yml`)

**觸發條件**：
- Push 到 `main` 或 `develop` 分支
- Pull Request 到 `main` 或 `develop` 分支

**執行內容**：
- ✅ 運行單元測試
- ✅ 代碼覆蓋率報告（上傳到 Codecov）
- ✅ Go vet 靜態分析
- ✅ golangci-lint 代碼檢查
- ✅ 多平台構建測試（Linux/macOS/Windows, AMD64/ARM64）
- ✅ Docker 鏡像構建測試

### 2. Release Workflow (`release.yml`)

**觸發條件**：
- 推送版本標籤（格式：`v*.*.*`，例如 `v1.0.0`）

**執行內容**：
- 🔨 構建多平台二進制文件：
  - Linux AMD64/ARM64
  - macOS AMD64/ARM64 (Intel/Apple Silicon)
  - Windows AMD64
- 📦 創建壓縮包（tar.gz 和 zip）
- 🔐 生成 SHA256 校驗和
- 📝 自動生成 Release Notes
- 🚀 創建 GitHub Release 並上傳文件

### 3. Docker Publish Workflow (`docker-publish.yml`)

**觸發條件**：
- 推送版本標籤（格式：`v*.*.*`）
- 手動觸發（workflow_dispatch）

**執行內容**：
- 🐳 構建多架構 Docker 鏡像（linux/amd64, linux/arm64）
- 📤 推送到 GitHub Container Registry (ghcr.io)
- 🏷️ 自動標記版本號和 latest
- 📋 生成 docker-compose.release.yml 部署清單

## 🚀 使用指南

### 發布新版本

1. **更新版本號**：
   ```bash
   echo "1.1.0" > go-services/VERSION
   ```

2. **更新 CHANGELOG.md**：
   ```bash
   # 在 go-services/CHANGELOG.md 中添加新版本的變更記錄
   ```

3. **提交更改**：
   ```bash
   git add go-services/VERSION go-services/CHANGELOG.md
   git commit -m "chore: bump version to 1.1.0"
   git push origin main
   ```

4. **創建並推送標籤**：
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```

5. **自動執行**：
   - Release workflow 會自動構建並發布二進制文件
   - Docker Publish workflow 會自動構建並推送 Docker 鏡像

### 查看工作流程狀態

訪問 GitHub 倉庫的 Actions 頁面：
```
https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

### 下載發布的文件

1. **二進制文件**：
   - 訪問 Releases 頁面
   - 下載適合您系統的壓縮包
   - 驗證 SHA256 校驗和

2. **Docker 鏡像**：
   ```bash
   # 拉取特定版本
   docker pull ghcr.io/YOUR_USERNAME/esp-platform-api-gateway:v1.0.0
   
   # 拉取最新版本
   docker pull ghcr.io/YOUR_USERNAME/esp-platform-api-gateway:latest
   ```

## 🔧 配置說明

### 必需的 Secrets

無需額外配置！所有 workflows 使用內建的 `GITHUB_TOKEN`。

### 可選的 Secrets

如果需要推送到其他 Docker Registry：

1. 訪問 Settings → Secrets and variables → Actions
2. 添加以下 secrets：
   - `DOCKER_USERNAME`: Docker Hub 用戶名
   - `DOCKER_PASSWORD`: Docker Hub 密碼或 Access Token

### 修改 Docker Registry

編輯 `.github/workflows/docker-publish.yml`：

```yaml
env:
  REGISTRY: docker.io  # 改為 Docker Hub
  IMAGE_PREFIX: your-username/esp-platform
```

## 📦 構建產物

### Release Workflow 產物

每次發布會生成以下文件：

```
esp-platform-linux-amd64.tar.gz       # Linux AMD64 二進制文件
esp-platform-linux-arm64.tar.gz       # Linux ARM64 二進制文件
esp-platform-darwin-amd64.tar.gz      # macOS Intel 二進制文件
esp-platform-darwin-arm64.tar.gz      # macOS Apple Silicon 二進制文件
esp-platform-windows-amd64.zip        # Windows AMD64 二進制文件
checksums.txt                          # SHA256 校驗和
```

每個壓縮包包含 5 個微服務的二進制文件：
- api-gateway
- auth-service
- device-service
- mqtt-service
- websocket-service

### Docker Publish Workflow 產物

推送到 GitHub Container Registry 的鏡像：

```
ghcr.io/YOUR_USERNAME/esp-platform-api-gateway:v1.0.0
ghcr.io/YOUR_USERNAME/esp-platform-auth-service:v1.0.0
ghcr.io/YOUR_USERNAME/esp-platform-device-service:v1.0.0
ghcr.io/YOUR_USERNAME/esp-platform-mqtt-service:v1.0.0
ghcr.io/YOUR_USERNAME/esp-platform-websocket-service:v1.0.0
```

每個鏡像支援多架構：
- linux/amd64
- linux/arm64

## 🐛 故障排除

### Workflow 失敗

1. **查看日誌**：
   - 訪問 Actions 頁面
   - 點擊失敗的 workflow
   - 查看詳細日誌

2. **常見問題**：
   - **構建失敗**：檢查 Go 代碼是否有編譯錯誤
   - **測試失敗**：檢查單元測試是否通過
   - **Docker 推送失敗**：檢查 GITHUB_TOKEN 權限

### 本地測試 Workflow

使用 [act](https://github.com/nektos/act) 在本地運行 GitHub Actions：

```bash
# 安裝 act
brew install act  # macOS
# 或
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# 運行 CI workflow
act push

# 運行 Release workflow
act -j build-and-release
```

## 📚 參考資源

- [GitHub Actions 文檔](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Go Setup Action](https://github.com/actions/setup-go)
- [golangci-lint Action](https://github.com/golangci/golangci-lint-action)

## 🔄 持續改進

未來可以添加的功能：

- [ ] 自動化安全掃描（Snyk, Trivy）
- [ ] 性能基準測試
- [ ] 自動化端到端測試
- [ ] Slack/Discord 通知
- [ ] 自動更新文檔
- [ ] 依賴項自動更新（Dependabot）
