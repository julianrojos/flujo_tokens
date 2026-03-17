export interface ArgOption {
  name: string;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface ArgConfig {
  command?: string;
  description?: string;
  options?: ArgOption[];
  examples?: string[];
}

export interface PrintUsageOptions {
  stream?: "stdout" | "stderr";
  exitCode?: number;
}

/**
 * Parse command-line arguments in --key=value, --key value, or --no-key format.
 * Supports --no-key convention for boolean false values.
 */
export function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

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
    
    // Handle --no-key convention for boolean false
    // Edge cases: 
    //   --no-verbose → args["verbose"] = false
    //   --no- → ignored (empty key after "no-")
    //   --no-no-verbose → args["no-verbose"] = false (NOT double negation)
    if (key.startsWith("no-") && key.length > 3) {
      const actualKey = key.slice(3);
      if (actualKey) {
        args[actualKey] = false;
        continue;
      }
    }
    
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }

  return args;
}

/**
 * Safely extract a string argument from parsed CLI args.
 */
export function getStringArg(
  args: Record<string, string | boolean>,
  key: string,
  fallback?: string,
): string | undefined {
  const value = args[key];
  if (typeof value === "string") return value;
  return fallback;
}

/**
 * Format a default value for display in usage text.
 */
function formatDefaultValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return ` (default: ${String(value)})`;
}

/**
 * Render usage help text from a configuration object.
 */
export function renderUsage(config: ArgConfig = {}): string {
  const { command = "", description = "", options = [], examples = [] } = config;
  const lines: string[] = [];

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

/**
 * Print usage help text to stdout or stderr.
 */
export function printUsage(
  config: ArgConfig,
  { stream = "stdout", exitCode }: PrintUsageOptions = {}
): void {
  const text = renderUsage(config);
  const writer = stream === "stderr" ? process.stderr : process.stdout;
  writer.write(text);
  if (typeof exitCode === "number") {
    process.exit(exitCode);
  }
}
