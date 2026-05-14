module.exports = {
  extends: './electron-builder.yml',
  win: {
    forceCodeSigning: true,
    signtoolOptions: {
      sign: './scripts/racent-windows-sign.cjs',
      signingHashAlgorithms: ['sha256'],
    },
  },
};
