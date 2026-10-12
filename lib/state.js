// Process-wide state shared between modules (the server keypair).
// keys.server is the fee-paying Keypair, keys.secret its secret key bytes; set once at startup.
const keys = { server:null, secret:null };

module.exports = { keys };
