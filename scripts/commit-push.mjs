import { spawnSync } from "node:child_process";

let gitCwd = process.cwd();

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: gitCwd,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr.trim() || `git ${args[0]} terminó con error.`);
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr.trim() };
}

function getCommitType(paths) {
  if (paths.every((path) => path.startsWith(".github/workflows/"))) return "ci";
  if (paths.every((path) => path.startsWith("docs/") || /^README(?:\.[^/]+)?$/i.test(path))) return "docs";
  if (paths.every((path) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(path))) return "test";
  return "chore";
}

function getScope(path) {
  const parts = path.split("/");
  if (parts[0] === ".github" && parts[1] === "workflows") return "workflows";
  if (parts[0] === "frontend" && parts[1] === "components" && parts[2] === "temas" && parts[3]) {
    return parts[3];
  }
  if (parts[0] === "frontend" && parts[1]) return parts[2] || parts[1];
  if (parts[0] === "backend" && parts[1] === "src" && parts[2]) return parts[2];
  return parts[0];
}

function getCommitMessage(paths) {
  const scopes = [...new Set(paths.map(getScope))];
  const scope = scopes.length === 1 ? `(${scopes[0].toLowerCase().replace(/[^a-z0-9-]+/g, "-")})` : "";
  let summary;

  if (paths.length === 1) {
    const fileName = paths[0].split("/").at(-1).replace(/\.[^.]+$/, "");
    const readableName = fileName.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ");
    summary = `actualiza ${readableName}`;
  } else {
    summary = `actualiza ${paths.length} archivos`;
  }

  const prefix = `${getCommitType(paths)}${scope}: `;
  const maxSummaryLength = 72 - prefix.length;
  if (summary.length > maxSummaryLength) {
    summary = `${summary.slice(0, maxSummaryLength - 3).trimEnd()}...`;
  }
  return `${prefix}${summary}`;
}

try {
  gitCwd = runGit(["rev-parse", "--show-toplevel"]).stdout.trim();
  const branch = runGit(["branch", "--show-current"]).stdout.trim();

  if (branch !== "develop") {
    throw new Error(`Estás en "${branch || "detached HEAD"}". Este comando solo publica la rama develop.`);
  }

  runGit(["fetch", "--quiet", "origin", "develop"]);
  const remoteIsAncestor = runGit(["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"], {
    allowFailure: true,
  });

  if (remoteIsAncestor.status !== 0) {
    if (remoteIsAncestor.status !== 1) {
      throw new Error(remoteIsAncestor.stderr || "No se pudo verificar la sincronización con origin/develop.");
    }
    throw new Error("origin/develop tiene cambios que tu rama local no contiene. Sincroniza develop antes de continuar.");
  }

  runGit(["add", "-A"]);
  const stagedPaths = runGit(["diff", "--cached", "--name-only", "-z"]).stdout
    .split("\0")
    .filter((path) => path.length > 0);

  if (stagedPaths.length > 0) {
    const message = getCommitMessage(stagedPaths);
    console.log(`Commit generado: ${message}`);
    const commit = runGit(["commit", "-m", message]);
    if (commit.stdout.trim()) console.log(commit.stdout.trim());
  } else {
    console.log("No hay cambios nuevos para crear un commit.");
  }

  const push = runGit(["push", "-u", "origin", "develop"]);
  if (push.stdout.trim()) console.log(push.stdout.trim());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
