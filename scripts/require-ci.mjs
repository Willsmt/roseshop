// Trava do deploy de produção: só roda no CI (constitution, princípio VIII).
// O GitHub Actions define CI=true automaticamente.
if (process.env.CI) {
  process.exit(0);
}
console.error("Deploy de produção só pelo CI (constitution, princípio VIII).");
process.exit(1);
