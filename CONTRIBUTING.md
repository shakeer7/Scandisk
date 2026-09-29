# Contributing to Scandisk

Thank you for your interest in contributing to **Scandisk**! We welcome community contributions to make Scandisk faster, more reliable, and visually stunning.

## Code of Conduct

Please be respectful, collaborative, and constructive when reporting issues, discussing proposals, or reviewing pull requests.

## How Can I Contribute?

### 1. Reporting Bugs
- Search existing GitHub Issues before opening a new one.
- Provide clear reproduction steps, OS version (Windows / macOS / Linux), and scanner output or error messages.

### 2. Feature Requests
- Check the issues tab to see if the feature has already been suggested.
- Clearly describe the use case and how it enhances local disk usage analysis.

### 3. Pull Requests
- Fork the repository and create your feature branch: `git checkout -b feature/my-new-feature`
- Keep changes concise, well-documented, and aligned with project privacy principles (no external analytics/telemetry).
- Ensure frontend and backend code builds without errors.
- Commit your changes and submit a pull request!

## Local Development Setup

### Prerequisites
- **Node.js**: v18+ or v20+
- **Rust**: Latest stable toolchain via [rustup.rs](https://rustup.rs)
- **Platform Dependencies**:
  - Windows: Visual Studio C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Running Locally
```bash
# Clone the repository
git clone https://github.com/your-username/scandisk.git
cd scandisk

# Install dependencies
npm install

# Start development server
npm run tauri dev
```

### Building for Production
```bash
npm run tauri build
```
The output binaries and installer (`.exe` on Windows, `.dmg` on macOS, `.deb`/`.AppImage` on Linux) will be generated in `src-tauri/target/release/bundle/`.
