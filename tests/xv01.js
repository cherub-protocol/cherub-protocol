const anchor = require('@project-serum/anchor');
const assert = require('assert');
const fs = require('fs');
const { TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token');
const TokenInstructions = require('@project-serum/serum').TokenInstructions;

const exchangeIdl = require('../target/idl/exchange.json');
const factoryIdl = require('../target/idl/factory.json');
const pythIdl = require('../target/idl/pyth.json');

const { LAMPORTS_PER_SOL, PublicKey, SystemProgram } = anchor.web3;

describe('XV01', () => {
  anchor.setProvider(anchor.Provider.env());

  const browserWallet = new PublicKey('BnvwAZTNTPQYo6j3Yv5v3HozjV2MkEoh4oQfDwMqbno8');

  const provider = anchor.getProvider();

  const localnet = provider.connection._rpcEndpoint === 'http://127.0.0.1:8899';

  const exchange = anchor.workspace.Exchange;
  const factory = anchor.workspace.Factory;
  const pyth = anchor.workspace.Pyth;

  let mintAuthority = provider.wallet;

  let mint0A = null;
  let mint0B = null;
  let mint1A = null;
  let mint1B = null;

  let mintC = null;

  const decimals0A = 18;
  const decimals0B = 18;
  const decimals1A = 0;
  const decimals1B = 0;

  const decimalsC = 18;

  const exchange0Account = anchor.web3.Keypair.generate();
  const exchange1Account = anchor.web3.Keypair.generate();
  const factoryAccount = anchor.web3.Keypair.generate();
  const payerAccount = anchor.web3.Keypair.generate();
  const pythAccount = anchor.web3.Keypair.generate();
  const traderAccount = anchor.web3.Keypair.generate();

  let exchangeTokenAccount0A = null;
  let exchangeTokenAccount0B = null;
  let exchangeTokenAccount1A = null;
  let exchangeTokenAccount1B = null;

  let walletTokenAccount0A = null;
  let walletTokenAccount0B = null;
  let walletTokenAccount1A = null;
  let walletTokenAccount1B = null;

  let walletTokenAccountC = null;

  let traderTokenAccount0A = null;
  let traderTokenAccount0B = null;
  let traderTokenAccount1A = null;
  let traderTokenAccount1B = null;

  let traderTokenAccountC = null;

  fs.writeFileSync('./app/src/exchange.json', JSON.stringify(exchangeIdl));
  fs.writeFileSync('./app/src/factory.json', JSON.stringify(factoryIdl));
  fs.writeFileSync('./app/src/pyth.json', JSON.stringify(pythIdl));

  const amount0A = 100000;
  const amount0B = 100000;

  const amount1A = 900000;
  const amount1B = 900000;

  const traderAmount0A = 500;
  const traderAmount0B = 500;

  const amountAirdrop = 50;

  it('State initialized', async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payerAccount.publicKey, amountAirdrop * LAMPORTS_PER_SOL),
      'confirmed'
    );

    if (localnet) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(browserWallet, 100 * LAMPORTS_PER_SOL),
        'confirmed'
      );
    }

    mint0A = await Token.createMint(
      provider.connection,
      payerAccount,
      mintAuthority.publicKey,
      null,
      decimals0A,
      TOKEN_PROGRAM_ID
    );

    mint0B = await Token.createMint(
      provider.connection,
      payerAccount,
      mintAuthority.publicKey,
      null,
      decimals0B,
      TOKEN_PROGRAM_ID
    );

    mint1A = await Token.createMint(
      provider.connection,
      payerAccount,
      mintAuthority.publicKey,
      null,
      decimals1A,
      TOKEN_PROGRAM_ID
    );

    mint1B = await Token.createMint(
      provider.connection,
      payerAccount,
      mintAuthority.publicKey,
      null,
      decimals1B,
      TOKEN_PROGRAM_ID
    );

    mintC = await Token.createMint(
      provider.connection,
      payerAccount,
      mintAuthority.publicKey,
      null,
      decimalsC,
      TOKEN_PROGRAM_ID
    );

    walletTokenAccount0A = await mint0A.createAccount(provider.wallet.publicKey);
    walletTokenAccount0B = await mint0B.createAccount(provider.wallet.publicKey);

    exchangeTokenAccount0A = await mint0A.createAccount(exchange0Account.publicKey);
    exchangeTokenAccount0B = await mint0B.createAccount(exchange0Account.publicKey);
    exchangeTokenAccount1A = await mint1A.createAccount(exchange1Account.publicKey);
    exchangeTokenAccount1B = await mint1B.createAccount(exchange1Account.publicKey);

    traderTokenAccount0A = await mint0A.createAccount(traderAccount.publicKey);
    traderTokenAccount0B = await mint0B.createAccount(traderAccount.publicKey);

    walletTokenAccountC = await mintC.createAccount(provider.wallet.publicKey);

    await mint0A.mintTo(
      walletTokenAccount0A,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      amount0A
    );

    await mint0B.mintTo(
      walletTokenAccount0B,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      amount0B
    );

    await mint0A.mintTo(
      traderTokenAccount0A,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      traderAmount0A
    );

    await mint0B.mintTo(
      traderTokenAccount0B,
      mintAuthority.publicKey,
      [mintAuthority.payer],
      traderAmount0B
    );

    // Useful for Anchor CLI and app
    fs.writeFileSync('./app/src/accounts-localnet.json', JSON.stringify({
      factory: factoryAccount.publicKey.toString(),
      exchanges: [
        exchange0Account.publicKey.toString(),
        exchange1Account.publicKey.toString()
      ],
      trader: traderAccount.publicKey.toString(),
      pyth: pythAccount.publicKey.toString(),
      mintA: mint0A.publicKey.toString(),
      mintB: mint0B.publicKey.toString(),
      mintC: mintC.publicKey.toString(),
    }));

    let walletTokenAccountInfoA = await mint0A.getAccountInfo(walletTokenAccount0A);
    let walletTokenAccountInfoB = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(walletTokenAccountInfoA.amount.toNumber() == amount0A);
    assert.ok(walletTokenAccountInfoB.amount.toNumber() == amount0B);

    let exchangeTokenAccountInfoA = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let exchangeTokenAccountInfoB = await mint0B.getAccountInfo(exchangeTokenAccount0B);

    assert.ok(exchangeTokenAccountInfoA.amount.toNumber() == 0);
    assert.ok(exchangeTokenAccountInfoB.amount.toNumber() == 0);

    let traderTokenAccountInfoA = await mint0A.getAccountInfo(traderTokenAccount0A);
    let traderTokenAccountInfoB = await mint0B.getAccountInfo(traderTokenAccount0B);

    assert.ok(traderTokenAccountInfoA.amount.toNumber() == traderAmount0A);
    assert.ok(traderTokenAccountInfoB.amount.toNumber() == traderAmount0B);

    let mint0AInfo = await mint0A.getMintInfo();

    assert.ok(mint0AInfo.supply.toNumber() == traderAmount0A + amount0A);

    let mint0BInfo = await mint0B.getMintInfo();

    assert.ok(mint0BInfo.supply.toNumber() == traderAmount0B + amount0B);

    let mintCInfo = await mintC.getMintInfo();

    assert.ok(mintCInfo.supply.toNumber() == 0);
  });

  it('Factory initialized', async () => {
    const tx = await factory.rpc.initialize(exchange.programId, {
      accounts: {
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        factory: factoryAccount.publicKey
      },
      signers: [factoryAccount]
    });

    console.log('Your transaction signature', tx);

    let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)

    assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(0)));
    assert.ok(factoryAccountInfo.exchangeTemplate.toString() == exchange.programId.toString());
  });

  it('Factory exchange created', async () => {
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    );
    const fee = new anchor.BN(3);
    const tx = await factory.rpc.createExchange(
      mint0A.publicKey,
      mint0B.publicKey,
      mintC.publicKey,
      fee, {
        accounts: {
          exchange: exchange0Account.publicKey,
          factory: factoryAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          exchangeProgram: exchange.programId,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B
        },
        signers: [factoryAccount.owner, exchange0Account],
        instructions: [await exchange.account.exchangeData.createInstruction(exchange0Account)]
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(0)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(0)));
    assert.ok(exchangeTokenAccount0AInfo.owner.equals(pda));
    assert.ok(exchangeTokenAccount0BInfo.owner.equals(pda));

    let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)

    assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(1)));
  });

  const initialMaxAmountA = 100;
  const initialAmountB = 50;
  const initialMinLiquidityC = 0;
  const initialLiquidityMinted = 50;

  it('Add initial liquidity', async () => {
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
          exchange: exchange0Account.publicKey,
          mint: mintC.publicKey,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          userC: walletTokenAccountC,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B
        },
        signers: [provider.wallet.owner]
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(initialMaxAmountA)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(amount0A - initialMaxAmountA)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(initialAmountB)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(amount0B - initialAmountB)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(initialLiquidityMinted)));
  });

  const additionalMaxAmountA = 150;
  const additionalAmountB = 75;
  const additionalMinLiquidityC = 5;
  const additionalLiquidityMinted = 37;

  it('Add additional liquidity', async () => {
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
          exchange: exchange0Account.publicKey,
          mint: mintC.publicKey,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          userC: walletTokenAccountC,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B
        },
        signers: [provider.wallet.owner]
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(initialMaxAmountA + additionalMaxAmountA)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(amount0A - initialMaxAmountA - additionalMaxAmountA)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(initialAmountB + additionalAmountB)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(amount0B - initialAmountB - additionalAmountB)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(initialLiquidityMinted + additionalLiquidityMinted)));
  });

  const traderInputQuoteAccount = anchor.web3.Keypair.generate();
  const aToBAmount = 10;

  it('Get input price', async () => {
    const tx = await exchange.rpc.getBToAInputPrice(
      new anchor.BN(aToBAmount),
      {
        accounts: {
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          exchange: exchange0Account.publicKey,
          quote: traderInputQuoteAccount.publicKey,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B,
        },
        signers: [traderInputQuoteAccount]
      });

    console.log('Your transaction signature', tx);

    let traderInputAccountQuoteInfo = await exchange.account.quote.fetch(traderInputQuoteAccount.publicKey);

    assert.ok(traderInputAccountQuoteInfo.price.eq(new anchor.BN(48)));
  });

  const traderOutputQuoteAccount = anchor.web3.Keypair.generate();
  const bToAAmount = 5;

  it('Get output price', async () => {
    const tx = await exchange.rpc.getBToAOutputPrice(
      new anchor.BN(bToAAmount),
      {
        accounts: {
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          exchange: exchange0Account.publicKey,
          quote: traderOutputQuoteAccount.publicKey,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B,
        },
        signers: [traderOutputQuoteAccount]
      });

    console.log('Your transaction signature', tx);

    let traderOutputQuoteAccountInfo = await exchange.account.quote.fetch(traderOutputQuoteAccount.publicKey);

    assert.ok(traderOutputQuoteAccountInfo.price.eq(new anchor.BN(4)));
  });

  const bToAAmountB = 6;

  it('B to A input', async () => {
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    );
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.bToAInput(
      new anchor.BN(bToAAmountB),
      deadline,
      {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          exchange: exchange0Account.publicKey,
          pda: pda,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B,
          recipient: walletTokenAccount0A
        }
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(218)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(99782)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(131)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(99869)));

    let exchange0AccountInfo = await exchange.account.exchangeData.fetch(exchange0Account.publicKey)

    assert.ok(exchange0AccountInfo.lastPrice.eq(new anchor.BN(6)));
  });

  const aToBAmountA = 12;

  it('A to B input', async () => {
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    );
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.aToBInput(
      new anchor.BN(aToBAmountA),
      deadline,
      {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          exchange: exchange0Account.publicKey,
          pda,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B,
          recipient: walletTokenAccount0A
        }
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(206)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(99794)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(150)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(99850)));

    let exchange0AccountInfo = await exchange.account.exchangeData.fetch(exchange0Account.publicKey)

    assert.ok(exchange0AccountInfo.lastPrice.eq(new anchor.BN(19)));
  });

  it('Initializes Pyth', async () => {
    await pyth.rpc.initialize({
      accounts: {
        authority: provider.wallet.publicKey,
        pyth: pythAccount.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [pythAccount]
    });

    assert.ok(true);
  });

  //it('Get SOL Price', async() => {
  //  const pythProdKey = new anchor.web3.PublicKey('8yrQMUyJRnCJ72NWwMiPV9dNGw465Z8bKUvnUC8P5L6F');
  //  const pythSOLPriceProgKey = new anchor.web3.PublicKey('BdgHsXrH1mXqhdosXavYxZgX6bGqTdj5mh2sxDhF8bJy');
  //  await pyth.rpc.getPrice({
  //    accounts: {
  //      pyth: pythAccount.publicKey,
  //      pythProductInfo: pythProdKey,
  //      pythPriceInfo: pythSOLPriceProgKey
  //    }
  //  });

  //  const accountInfo = await provider.connection.getAccountInfo(pythAccount.publicKey);
  //  console.log('data = ', accountInfo.data);

  //  assert.ok(accountInfo.data);
  //});

  const removeAmountC = 87;

  it('Remove liquidity', async () => {
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    );
    const deadline = new anchor.BN(Date.now() / 1000);
    const tx = await exchange.rpc.removeLiquidity(
      new anchor.BN(removeAmountC),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          mint: mintC.publicKey,
          pda,
          exchange: exchange0Account.publicKey,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          userC: walletTokenAccountC
        }
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(0)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(amount0A)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(0)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(amount0B)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(0)));
  });

  it('Add additional liquidity', async () => {
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
          exchange: exchange0Account.publicKey,
          mint: mintC.publicKey,
          userA: walletTokenAccount0A,
          userB: walletTokenAccount0B,
          userC: walletTokenAccountC,
          exchangeA: exchangeTokenAccount0A,
          exchangeB: exchangeTokenAccount0B
        },
        signers: [provider.wallet.owner]
      });

    console.log('Your transaction signature', tx);

    let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);
    let walletTokenAccount0AInfo = await mint0A.getAccountInfo(walletTokenAccount0A);

    assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(additionalMaxAmountA)));
    assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(99850)));

    let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);
    let walletTokenAccount0BInfo = await mint0B.getAccountInfo(walletTokenAccount0B);

    assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(75)));
    assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(99925)));

    let walletTokenAccountCInfo = await mintC.getAccountInfo(walletTokenAccountC);

    assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(75)));
  });

  it('Second factory exchange created', async () => {
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    );
    const fee = new anchor.BN(3);
    const tx = await factory.rpc.createExchange(
      mintC.publicKey,
      mint1B.publicKey,
      mintC.publicKey,
      fee, {
        accounts: {
          exchange: exchange1Account.publicKey,
          factory: factoryAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          exchangeProgram: exchange.programId,
          exchangeA: exchangeTokenAccount1A,
          exchangeB: exchangeTokenAccount1B
        },
        signers: [factoryAccount.owner, exchange1Account],
        instructions: [await exchange.account.exchangeData.createInstruction(exchange1Account)]
      });

    console.log('Your transaction signature', tx);

    //let exchangeTokenAccount0AInfo = await mint0A.getAccountInfo(exchangeTokenAccount0A);

    //assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(0)));

    //let exchangeTokenAccount0BInfo = await mint0B.getAccountInfo(exchangeTokenAccount0B);

    //assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(0)));
    //assert.ok(exchangeTokenAccount0AInfo.owner.equals(pda));
    //assert.ok(exchangeTokenAccount0BInfo.owner.equals(pda));

    //let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)

    //assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(1)));
  });
});
