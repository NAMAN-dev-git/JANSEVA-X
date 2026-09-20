const fs = require("fs");
const path = require("path");

const employeeRoot = path.resolve(__dirname, "..");
const citizenClient = path.resolve(employeeRoot, "..", "citizen-backend", "node_modules", ".prisma", "client");
const employeeClient = path.resolve(employeeRoot, "node_modules", ".prisma", "client");
const generatedTypes = path.join(citizenClient, "index.d.ts");

if (!fs.existsSync(generatedTypes) || !fs.readFileSync(generatedTypes, "utf8").includes("ApplicationStatus")) {
  throw new Error("The authoritative citizen Prisma client is unavailable. Run citizen-backend Prisma generation before employee-backend setup.");
}

// Prisma writes the client beside the authoritative schema. Employee code uses
// its own @prisma/client package, so link only its generated-client directory.
// The schema remains single-sourced in citizen-backend/prisma/schema.prisma.
fs.rmSync(employeeClient, { recursive: true, force: true });
fs.mkdirSync(path.dirname(employeeClient), { recursive: true });
fs.symlinkSync(citizenClient, employeeClient, process.platform === "win32" ? "junction" : "dir");
console.log(`Linked employee Prisma client to ${citizenClient}`);
