# Gengar Archive

A Node.js card collection gallery with an authenticated owner workspace.

Public visitors can search reviewed cards and switch between front and back photos. The owner can edit card metadata, record market estimates, and attach multiple sold comparisons with prices and source links.

## Local setup

Requires Node.js 22. Run `npm ci`, then `node scripts/setup-owner.mjs your-email@example.com`, then `npm start`. Open http://127.0.0.1:4317. Save the generated website password from `Owner-Access.txt` privately.

Collection catalogs and images are supplied separately in the data directory. This repository contains application code only, without a collection dataset or credentials.

Run `npm test` to check access controls, validation, and valuation behavior. See [DEPLOYMENT.md](DEPLOYMENT.md) for Render setup and private data transfer.

