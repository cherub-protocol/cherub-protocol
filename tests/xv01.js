const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const assert = require("assert");

const { SystemProgram } = anchor.web3;

describe("XV01", () => {
  anchor.setProvider(anchor.Provider.env());

  const factory = anchor.workspace.Factory;
  const exchange = anchor.workspace.Exchange;

  const provider = anchor.getProvider();

  const payer = anchor.web3.Keypair.generate();

  let mintAuthority = provider.wallet;
  let mintA = null;
  let mintB = null;

  const amountA = 100000;
  const amountB = 100000;

  const amountLamports = 1000000000;  // 10,000,000 Lamports in 1 SOL
  const decimalsA = 18;
  const decimalsB = 18;
  const decimalsC = 18;

  const factoryAccount = anchor.web3.Keypair.generate();
  const exchangeAccount = anchor.web3.Keypair.generate();

  const exchangeTemplate = anchor.web3.Keypair.generate();

  let exchangeTokenAccountA = null;
  let exchangeTokenAccountB = null;

  let walletTokenAccountA = null;
  let walletTokenAccountB = null;
  let walletTokenAccountC = null;

  it("State initialized", async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, amountLamports),
      "confirmed"
    );

    mintA = await Token.createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      decimalsA,
      TOKEN_PROGRAM_ID
    );

    mintB = await Token.createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      decimalsB,
      TOKEN_PROGRAM_ID
    );

    mintC = await Token.createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      decimalsC,
      TOKEN_PROGRAM_ID
    );

    walletTokenAccountA = await mintA.createAccount(provider.wallet.publicKey);
    walletTokenAccountB = await mintB.createAccount(provider.wallet.publicKey);
    walletTokenAccountC = await mintC.createAccount(provider.wallet.publicKey);

    exchangeTokenAccountA = await mintA.createAccount(exchangeAccount.publicKey);
    exchangeTokenAccountB = await mintB.createAccount(exchangeAccount.publicKey);

    await mintA.mintTo(
      walletTokenAccountA,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      amountA
    );

    await mintB.mintTo(
      walletTokenAccountB,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      amountB
    );

    let walletTokenAccountInfoA = await mintA.getAccountInfo(walletTokenAccountA);
    let walletTokenAccountInfoB = await mintB.getAccountInfo(walletTokenAccountB);

    assert.ok(walletTokenAccountInfoA.amount.toNumber() == amountA);
    assert.ok(walletTokenAccountInfoB.amount.toNumber() == amountB);

    let exchangeTokenAccountInfoA = await mintA.getAccountInfo(exchangeTokenAccountA);
    let exchangeTokenAccountInfoB = await mintB.getAccountInfo(exchangeTokenAccountB);

    assert.ok(exchangeTokenAccountInfoA.amount.toNumber() == 0);
    assert.ok(exchangeTokenAccountInfoB.amount.toNumber() == 0);
  });

  it("Factory initialized", async () => {
    const tx = await factory.rpc.initialize(exchangeTemplate.publicKey, {
      accounts: {
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        factory: factoryAccount.publicKey
      },
      signers: [factoryAccount]
    });

    console.log("Your transaction signature", tx);

    let factoryAccountInfo = await factory.account.factory.fetch(factoryAccount.publicKey)

    assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(0)));
    assert.ok(factoryAccountInfo.exchangeTemplate.toString() == exchangeTemplate.publicKey.toString());
  });

  it("Exchange initialized", async () => {
    const tx = await exchange.rpc.initialize({
      accounts: {
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        exchange: exchangeAccount.publicKey
      },
      signers: [exchangeAccount]
    });

    console.log("Your transaction signature", tx);
  });

  it("Exchange created", async () => {
    const tx = await factory.rpc.createExchange(
      mintA.publicKey,
      mintB.publicKey,
      mintC.publicKey, {
        accounts: {
          factory: factoryAccount.publicKey,
          exchange: exchangeAccount.publicKey,
          exchangeProgram: exchange.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [factoryAccount.owner],
      });

    console.log("Your transaction signature", tx);

    let exchangeTokenAccountAInfo = await mintA.getAccountInfo(exchangeTokenAccountA);

    assert.ok(exchangeTokenAccountAInfo.amount.eq(new anchor.BN(0)));

    let exchangeTokenAccountBInfo = await mintB.getAccountInfo(exchangeTokenAccountB);

    assert.ok(exchangeTokenAccountBInfo.amount.eq(new anchor.BN(0)));
  });

  const initialMaxAmountA = 100;
  const initialAmountB = 50;
  const initialMinLiquidityC = 0;
  const initialLiquidityMinted = 50;

  it("Add initial liquidity", async () => {
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.addLiquidity(
      new anchor.BN(initialMaxAmountA),
      new anchor.BN(initialAmountB),
      new anchor.BN(initialMinLiquidityC),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount.publicKey,
          mint: mintC.publicKey,
          fromA: walletTokenAccountA,
          fromB: walletTokenAccountB,
          toA: exchangeTokenAccountA,
          toB: exchangeTokenAccountB,
          toC: walletTokenAccountC
        },
        signers: [provider.wallet.owner]
      });

    console.log("Your transaction signature", tx);

    let exchangeTokenAccountAInfo = await mintA.getAccountInfo(exchangeTokenAccountA);
    let walletTokenAccountAInfo = await mintA.getAccountInfo(walletTokenAccountA);

    assert.ok(exchangeTokenAccountAInfo.amount.eq(new anchor.BN(initialMaxAmountA)));
    assert.ok(walletTokenAccountAInfo.amount.eq(new anchor.BN(amountA - initialMaxAmountA)));

    let exchangeTokenAccountBInfo = await mintB.getAccountInfo(exchangeTokenAccountB);
    let walletTokenAccountBInfo = await mintB.getAccountInfo(walletTokenAccountB);

    assert.ok(exchangeTokenAccountBInfo.amount.eq(new anchor.BN(initialAmountB)));
    assert.ok(walletTokenAccountBInfo.amount.eq(new anchor.BN(amountB - initialAmountB)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(initialLiquidityMinted)));
  });

  const additionalMaxAmountA = 150;
  const additionalAmountB = 75;
  const additionalMinLiquidityC = 5;
  const additionalLiquidityMinted = 25;

  it("Add additional liquidity", async () => {
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.addLiquidity(
      new anchor.BN(additionalMaxAmountA),
      new anchor.BN(additionalAmountB),
      new anchor.BN(additionalMinLiquidityC),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount.publicKey,
          mint: mintC.publicKey,
          fromA: walletTokenAccountA,
          fromB: walletTokenAccountB,
          toA: exchangeTokenAccountA,
          toB: exchangeTokenAccountB,
          toC: walletTokenAccountC
        },
        signers: [provider.wallet.owner]
      });

    console.log("Your transaction signature", tx);

    let exchangeTokenAccountAInfo = await mintA.getAccountInfo(exchangeTokenAccountA);
    let walletTokenAccountAInfo = await mintA.getAccountInfo(walletTokenAccountA);

    assert.ok(exchangeTokenAccountAInfo.amount.eq(new anchor.BN(250)));
    assert.ok(walletTokenAccountAInfo.amount.eq(new anchor.BN(99750)));

    let exchangeTokenAccountBInfo = await mintB.getAccountInfo(exchangeTokenAccountB);
    let walletTokenAccountBInfo = await mintB.getAccountInfo(walletTokenAccountB);

    assert.ok(exchangeTokenAccountBInfo.amount.eq(new anchor.BN(125)));
    assert.ok(walletTokenAccountBInfo.amount.eq(new anchor.BN(99875)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(87)));
  });

  const removeAmountC = 87;
  const removeMinAmountA = initialMaxAmountA + additionalMaxAmountA;
  const removeMinAmountB = initialAmountB + additionalAmountB;

  it("Remove liquidity", async () => {
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.removeLiquidity(
      new anchor.BN(removeAmountC),
      new anchor.BN(removeMinAmountA),
      new anchor.BN(removeMinAmountB),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          mint: mintC.publicKey,
          exchange: exchangeAccount.publicKey,
          fromA: exchangeTokenAccountA,
          fromB: exchangeTokenAccountB,
          toA: walletTokenAccountA,
          toB: walletTokenAccountB,
          toC: walletTokenAccountC
        },
        signers: [exchangeAccount]
      });

    console.log("Your transaction signature", tx);

    let exchangeTokenAccountAInfo = await mintA.getAccountInfo(exchangeTokenAccountA);
    let walletTokenAccountAInfo = await mintA.getAccountInfo(walletTokenAccountA);

    assert.ok(exchangeTokenAccountAInfo.amount.eq(new anchor.BN(0)));
    assert.ok(walletTokenAccountAInfo.amount.eq(new anchor.BN(amountA)));

    let exchangeTokenAccountBInfo = await mintB.getAccountInfo(exchangeTokenAccountB);
    let walletTokenAccountBInfo = await mintB.getAccountInfo(walletTokenAccountB);

    assert.ok(exchangeTokenAccountBInfo.amount.eq(new anchor.BN(0)));
    assert.ok(walletTokenAccountBInfo.amount.eq(new anchor.BN(amountB)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(0)));
  });
});
