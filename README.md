# Disklens 🔍

> **A fast, private, and visually polished cross-platform local disk usage analyzer.**  
> Built with **Tauri v2**, **Rust**, **React**, and **TypeScript**.

[![Build and Release](https://github.com/shakeer7/disklens/actions/workflows/build.yml/badge.svg)](https://github.com/shakeer7/disklens/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg)]()

---

## 🌟 Key Features

- **⚡ Blazing Fast Multithreaded Scanning**: Powered by Rust and `jwalk`, scanning thousands of files per second asynchronously without freezing the interface.
- **🗺️ Interactive Treemap**: Visually explore your filesystem by disk consumption. Click any folder tile to drill down with instant breadcrumb navigation.
- **📊 File Type Breakdown & Clickable Charts**: Donut chart distribution of storage by extension. Click any slice to inspect largest files of that type.
- **📁 Folder Analysis**: Dedicated folders view showing item counts, sizes, and deep-scan actions.
- **🔍 Global Search**: Rapidly find files across your entire scanned directory by keyword or extension.
- **🧹 Smart Cleanup**: Identify large temporary files, logs, and caches with safe one-click OS Recycle Bin / Trash support.
- **🎨 3 Visual Aesthetics**:
  - **Material Design**: Clean, elevated surfaces and crisp typography.
  - **Glassmorphism**: Frosted glass panels with subtle blur and translucent borders.
  - **Neumorphism**: Soft, sculpted light & dark surfaces.
- **🌙 First-Class Dark Mode**: Effortlessly toggle between light and dark modes with persisted local state.
- **🔒 100% Private & Local**: **Your data never leaves your computer.** Disklens has zero cloud backend, zero tracking, and zero telemetry.

---

## 📐 Architecture

Disklens separates heavy filesystem operations from UI rendering:

```
[ User UI ]
    ↓
[ React + TypeScript (Vite) ]  ← Charts, Treemap, Themes, Navigation
    ↓ (Tauri IPC Bridge)
[ Rust Scanning Engine ]       ← Multithreaded jwalk, sysinfo, trash crate
    ↓
[ Local Filesystem ]
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or v20+)
- [Rust & Cargo](https://rustup.rs) (stable)
- Platform C++ build tools (Visual Studio C++ Build Tools on Windows, Xcode CLI on macOS)

### Installation & Development

```bash
# 1. Clone the repository
git clone https://github.com/shakeer7/disklens.git
cd disklens

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run tauri dev
```

### Production Build

To compile a standalone installer and executable:

```bash
npm run tauri build
```

The generated installers will be located in:
- **Windows**: `src-tauri/target/release/bundle/nsis/Disklens-Setup.exe`
- **macOS**: `src-tauri/target/release/bundle/dmg/Disklens.dmg`
- **Linux**: `src-tauri/target/release/bundle/deb/` / `appimage/`

---

## 🛡️ Privacy Guarantee

> **Your data stays on your device.**  
> Disklens does not upload your files, filenames, or disk information anywhere. All calculations are performed strictly locally in memory.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
