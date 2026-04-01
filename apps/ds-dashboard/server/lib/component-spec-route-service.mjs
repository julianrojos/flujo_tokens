export async function resolveComponentSpecRequestContext({
  requireDevEdit = false,
  systemHeader,
  routeSlug,
  getSystemContextFn,
  isDevRuntimeFn,
  sanitizeComponentSlugFn,
  resolveComponentSpecTargetFn,
  resolveRepoFilePathFn,
}) {
  const sysCtx = getSystemContextFn(systemHeader);

  if (requireDevEdit && !isDevRuntimeFn()) {
    return {
      ok: false,
      error: {
        statusCode: 403,
        args: {
          code: "component_spec.editing_disabled",
          userMessage: "Spec editing is only enabled in development mode.",
          recoverable: true,
        },
      },
    };
  }

  const slug = sanitizeComponentSlugFn(routeSlug);
  if (!slug) {
    return {
      ok: false,
      error: {
        statusCode: 400,
        args: {
          code: "validation.invalid_component_slug",
          userMessage: "Invalid component slug.",
          recoverable: true,
          context: { slug: routeSlug },
        },
      },
    };
  }

  const target = await resolveComponentSpecTargetFn(
    {
      repoRoot: sysCtx.repoRoot,
      docsDir: sysCtx.docsDir,
      slug,
    },
    { resolveRepoFilePathFn },
  );
  if (!target.ok) {
    return {
      ok: false,
      error: {
        statusCode: 404,
        args: {
          code: "component_spec.not_found",
          userMessage: target.message,
          recoverable: true,
          context: { slug },
        },
      },
    };
  }

  return {
    ok: true,
    sysCtx,
    slug,
    target,
  };
}
