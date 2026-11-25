# Chequeplease

![Repo size](https://img.shields.io/github/repo-size/mikewithoutthemechanics/chequeplease)
![License](https://img.shields.io/github/license/mikewithoutthemechanics/chequeplease)
![Top language](https://img.shields.io/github/languages/top/mikewithoutthemechanics/chequeplease)

## 👋 Hi, I'm Michael

This is one of my projects. Here's what it's about, why it exists, and how you can use it.

## 📦 What it does

Self-Hosted White-Label UPI Payment Gateway with Payment Observation Engine

## 🎯 The goal it fills

This project exists to solve a specific need and make a particular task simpler. Whether it's automating a workflow, serving a website, or powering a tool, the goal is to be practical, usable, and straightforward.

## 🚀 How to use

1. **Get the code**
   ```bash
   git clone https://github.com/mikewithoutthemechanics/chequeplease.git
   cd chequeplease
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run it**
   See the available commands below and pick the one you need.

### Available commands

| `npm run build` | tsc -b |
| `npm run clean` | node scripts/clean.js |
| `npm run db:setup` | node scripts/init-db.cjs |
| `npm run sync:package` | node scripts/sync-package.cjs |
| `npm run start` | node scripts/start.js |
| `npm run start:prod` | node scripts/start.js |
| `npm run start:prod:api` | node apps/payment-api/src/index.js |
| `npm run dev` | node scripts/dev.js |
| `npm run test` | node scripts/test-all.js |
| `npm run test:all` | node scripts/test-all.js |
| `npm run test:acceptance` | node --test scripts/production-infrastructure.test.js |
| `npm run typecheck` | tsc -b --noEmit |

## 🛠️ Tech stack

typescript

## 💡 Why it matters

This project is built to be useful and easy to pick up. If you're looking for a tool that does chequeplease, this is a clean, maintainable starting point you can adapt to your own needs.

## 📄 License

MIT

---

Made with ❤️ by Michael
