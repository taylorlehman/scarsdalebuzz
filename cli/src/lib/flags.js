/**
 * Commander option scoping can be surprising when the same flag is defined
 * globally and on subcommands. For agent-friendly JSON output we treat "json
 * mode" as enabled if any command in the ancestry has `opts.json === true`.
 *
 * @param {import('commander').Command} cmd
 * @param {Record<string, any> | undefined} opts
 * @returns {boolean}
 */
export function getJsonFlag(cmd, opts) {
  const hasJson = (c) => Boolean(c?.opts?.().json);
  return Boolean(opts?.json || hasJson(cmd) || hasJson(cmd?.parent) || hasJson(cmd?.parent?.parent));
}

