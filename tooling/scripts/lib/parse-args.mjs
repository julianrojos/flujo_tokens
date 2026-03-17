export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const eqIdx = token.indexOf("=");
    if (eqIdx !== -1) {
      // --key=value format
      const key = token.slice(2, eqIdx);
      args[key] = token.slice(eqIdx + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function formatDefaultValue(value) {
  if (value === undefined || value === null || value === "") return "";
  return ` (default: ${String(value)})`;
}

export function renderUsage({
  command = "",
  description = "",
  options = [],
  examples = [],
} = {}) {
  const lines = [];

  if (command) lines.push(`Usage: ${command}`);
  if (description) lines.push(description);

  if (options.length > 0) {
    lines.push("");
    lines.push("Options:");
    for (const option of options) {
      const name = String(option.name || "").trim();
      if (!name) continue;
      const required = option.required ? " (required)" : "";
      const defaultText = formatDefaultValue(option.defaultValue);
      const details = String(option.description || "").trim();
      lines.push(`  ${name}${required}${defaultText}`);
      if (details) lines.push(`    ${details}`);
    }
  }

  if (examples.length > 0) {
    lines.push("");
    lines.push("Examples:");
    for (const example of examples) {
      lines.push(`  ${example}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function printUsage(config, { stream = "stdout", exitCode } = {}) {
  const text = renderUsage(config);
  const writer = stream === "stderr" ? process.stderr : process.stdout;
  writer.write(text);
  if (typeof exitCode === "number") {
    process.exit(exitCode);
  }
}
