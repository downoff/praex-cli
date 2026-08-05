export async function upgrade() {
  // Praex: auto-update is permanently off. The inherited updater checked the upstream
  // project's releases — letting it run would replace the praex binary with a foreign
  // build. Praex updates ship through praex's own channels.
  return
}
