const { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID, Token } = require('@solana/spl-token')
const { parsePriceData } = require('@pythnetwork/client')
const anchor = require('@project-serum/anchor')
const assert = require('assert')
const fs = require('fs')

const daoIdl = require('../target/idl/dao.json')
const exchangeIdl = require('../target/idl/exchange.json')
const factoryIdl = require('../target/idl/factory.json')
const pythIdl = require('../target/idl/pyth.json')

const { LAMPORTS_PER_SOL, PublicKey, SystemProgram } = anchor.web3

describe('Cherub', () => {
  anchor.setProvider(anchor.Provider.env())

  const provider = anchor.getProvider()

  const IS_LOCALNET = provider.connection._rpcEndpoint === 'http://127.0.0.1:8899'

  const accountsFile = IS_LOCALNET ? './app/src/accounts-localnet.json' : './app/src/accounts-devnet.json'

  const dao = anchor.workspace.Dao
  const exchange = anchor.workspace.Exchange
  const factory = anchor.workspace.Factory
  const pyth = anchor.workspace.Pyth

  fs.writeFileSync('./app/src/dao.json', JSON.stringify(daoIdl))
  fs.writeFileSync('./app/src/exchange.json', JSON.stringify(exchangeIdl))
  fs.writeFileSync('./app/src/factory.json', JSON.stringify(factoryIdl))
  fs.writeFileSync('./app/src/pyth.json', JSON.stringify(pythIdl))

  let mintAuthority = provider.wallet

  let tokenC
  let tokenS

  const decimalsC = 9
  const decimalsS = 9

  // First exchange token vault is SOL
  const decimals0V = 9

  // Second exchange token vault is CHRB
  const decimals1V = 9

  const daoAccount = anchor.web3.Keypair.generate()
  const exchangeAccount0 = anchor.web3.Keypair.generate()
  const exchangeAccount1 = anchor.web3.Keypair.generate()
  const factoryAccount = anchor.web3.Keypair.generate()

  let oracleFeedAccount0
  let oracleFeedAccount1

  let exchangeTokenAccount0V
  let exchangeTokenAccount1V

  let walletTokenAccountC
  let walletTokenAccountS

  let walletTokenAccount0V
  let walletTokenAccount1V

  const airdropAmount = IS_LOCALNET ? 100000 * LAMPORTS_PER_SOL : 3 * LAMPORTS_PER_SOL

  const walletAmount0V = IS_LOCALNET ? 100000 * (10 ** decimals0V) : 1
  const walletAmount1V = 100000 * (10 ** decimals1V)

  const Direction = {
    Long: { long: {} },
    Short: { short: {} },
  }

  const Status = {
    Open: { open: {} },
    Closed: { closed: {} },
    Liquidated: { liquidated: {} },
  }

  const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }

  it('State: Initializes', async () => {
    await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(provider.wallet.publicKey, airdropAmount), 'confirmed')

    tokenC = await Token.createMint(provider.connection, provider.wallet.payer, mintAuthority.publicKey, null, decimalsC, TOKEN_PROGRAM_ID)
    tokenS = await Token.createMint(provider.connection, provider.wallet.payer, mintAuthority.publicKey, null, decimalsS, TOKEN_PROGRAM_ID)

    // First exchange token vault is SOL
    token0V = new Token(provider.connection, NATIVE_MINT, TOKEN_PROGRAM_ID, provider.wallet.payer)

    // Second exchange token vault is CHRB
    token1V = tokenC

    factoryTokenAccountC = await tokenC.createAccount(provider.wallet.publicKey)

    walletTokenAccountC = await tokenC.createAssociatedTokenAccount(provider.wallet.publicKey)
    walletTokenAccountS = await tokenS.createAssociatedTokenAccount(provider.wallet.publicKey)

    // Wrap native SOL
    walletTokenAccount0V = await Token.createWrappedNativeAccount(
      provider.connection,
      TOKEN_PROGRAM_ID,
      provider.wallet.publicKey,
      provider.wallet.payer,
      walletAmount0V
    )
    walletTokenAccount1V = walletTokenAccountC

    exchangeTokenAccount0V = await token0V.createAssociatedTokenAccount(exchangeAccount0.publicKey)
    exchangeTokenAccount1V = await token1V.createAssociatedTokenAccount(exchangeAccount1.publicKey)

    oracleFeedAccount0 = new anchor.web3.Account()
    oracleFeedAccount1 = new anchor.web3.Account()

    // Useful for Anchor CLI and app
    fs.writeFileSync(accountsFile, JSON.stringify({
      dao: {
        account: daoAccount.publicKey.toString()
      },
      exchanges: [{
        account: exchangeAccount0.publicKey.toString(),
        // TODO: Can be derived using associated token account
        accountV: exchangeTokenAccount0V.toString(),
        oracle: oracleFeedAccount0.publicKey.toString(),
        symbol: 'SOL',
        tokenV: token0V.publicKey.toString()
      }, {
        account: exchangeAccount1.publicKey.toString(),
        // TODO: Can be derived using associated token account
        accountV: exchangeTokenAccount1V.toString(),
        oracle: oracleFeedAccount1.publicKey.toString(),
        symbol: 'CHRB',
        tokenV: token1V.publicKey.toString()
      }],
      factory: {
        account: factoryAccount.publicKey.toString(),
        accountC: factoryTokenAccountC.toString(),
        tokenC: tokenC.publicKey.toString(),
        tokenS: tokenS.publicKey.toString()
      },
      user: {
        sol: walletTokenAccount0V.toString()
      }
    }))

    let walletTokenAccountInfoV = await token0V.getAccountInfo(walletTokenAccount0V)
    assert.ok(walletTokenAccountInfoV.amount.toNumber() == walletAmount0V)

    let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
    let exchangeTokenAccountInfo1V = await token1V.getAccountInfo(exchangeTokenAccount1V)
    assert.ok(exchangeTokenAccountInfo0V.amount.toNumber() == 0)
    assert.ok(exchangeTokenAccountInfo1V.amount.toNumber() == 0)

    let tokenInfo0V = await token0V.getMintInfo()
    assert.ok(tokenInfo0V.supply.toNumber() == 0)

    let tokenInfo1V = await token1V.getMintInfo()
    assert.ok(tokenInfo1V.supply.toNumber() == 0)

    let tokenInfoC = await tokenC.getMintInfo()
    assert.ok(tokenInfoC.supply.toNumber() == 0)
  })

  it('DAO: Initializes', async () => {
    const tx = await dao.rpc.initialize(provider.wallet.publicKey, {
      accounts: {
        authority: provider.wallet.publicKey,
        dao: daoAccount.publicKey,
        systemProgram: SystemProgram.programId
      },
      //instructions: [await dao.account.daoData.createInstruction(daoAccount)],
      signers: [daoAccount]
    })

    console.log('Your transaction signature', tx)

    //let daoAccountInfo = await dao.account.daoData.fetch(daoAccount.publicKey)
    //assert.ok(daoAccountInfo.proposals.eq(new anchor.BN(0)))
  })

  it('DAO: Creates first proposal', async () => {
    const [proposalPda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode(0))],
      dao.programId
    )
    const deadline = new anchor.BN((Date.now() + (60 * 60 * 24 * 3)) / 1000)
    const description = 'Add AAVE, SUSHI, YFI'
    const tx = await dao.rpc.propose(bump, deadline, description, {
      accounts: {
        authority: provider.wallet.publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        dao: daoAccount.publicKey,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId
      }
    })

    console.log('Your transaction signature', tx)

    let proposalPdaAccountInfo = await dao.account.proposalData.fetch(proposalPda)
    assert.ok(proposalPdaAccountInfo.votes.eq(new anchor.BN(0)))
    assert.ok(proposalPdaAccountInfo.description === description)
    assert.ok(proposalPdaAccountInfo.deadline.eq(deadline))
    assert.ok(proposalPdaAccountInfo.index.eq(new anchor.BN(0)))
  })

  it('DAO: Creates second proposal', async () => {
    const [proposalPda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode(1))],
      dao.programId
    )
    const deadline = new anchor.BN((Date.now() + (60 * 60 * 24 * 3)) / 1000)
    const description = 'Move SOL/COPE stake to SOL/MANGO'
    const tx = await dao.rpc.propose(bump, deadline, description, {
      accounts: {
        authority: provider.wallet.publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        dao: daoAccount.publicKey,
        proposal: proposalPda,
        systemProgram: SystemProgram.programId
      }
    })

    console.log('Your transaction signature', tx)

    let proposalPdaAccountInfo = await dao.account.proposalData.fetch(proposalPda)
    assert.ok(proposalPdaAccountInfo.votes.eq(new anchor.BN(0)))
    assert.ok(proposalPdaAccountInfo.description === description)
    assert.ok(proposalPdaAccountInfo.deadline.eq(deadline))
    assert.ok(proposalPdaAccountInfo.index.eq(new anchor.BN(1)))
  })

  it('Pyth: Initializes first oracle', async () => {
    const oracleInitPrice0 = 681.47
    const oracleConf0 = 0
    const oracleExpo0 = -9
    const tx = await pyth.rpc.initialize(
      new anchor.BN(oracleInitPrice0).mul(new anchor.BN(10).pow(new anchor.BN(-oracleExpo0))),
      oracleExpo0,
      new anchor.BN(oracleConf0), {
        accounts: {
          price: oracleFeedAccount0.publicKey
        },
        instructions: [
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: pyth.provider.wallet.publicKey,
            newAccountPubkey: oracleFeedAccount0.publicKey,
            space: 3312,
            lamports: await pyth.provider.connection.getMinimumBalanceForRentExemption(3312),
            programId: pyth.programId
          })
        ],
        signers: [oracleFeedAccount0]
      })

    console.log('Your transaction signature', tx)

    const oracleFeedAccountInfo0 = await pyth.provider.connection.getAccountInfo(oracleFeedAccount0.publicKey)
    assert.ok(new anchor.BN(parsePriceData(oracleFeedAccountInfo0.data).price).eq(new anchor.BN(oracleInitPrice0)))
  })

  it('Pyth: Initializes second oracle', async () => {
    const oracleInitPrice1 = 903.49
    const oracleConf1 = 0
    const oracleExpo1 = -9
    const tx = await pyth.rpc.initialize(
      new anchor.BN(oracleInitPrice1).mul(new anchor.BN(10).pow(new anchor.BN(-oracleExpo1))),
      oracleExpo1,
      new anchor.BN(oracleConf1), {
        accounts: {
          price: oracleFeedAccount1.publicKey
        },
        instructions: [
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: pyth.provider.wallet.publicKey,
            newAccountPubkey: oracleFeedAccount1.publicKey,
            space: 3312,
            lamports: await pyth.provider.connection.getMinimumBalanceForRentExemption(3312),
            programId: pyth.programId
          })
        ],
        signers: [oracleFeedAccount1]
      })

    console.log('Your transaction signature', tx)

    const oracleFeedAccountInfo1 = await pyth.provider.connection.getAccountInfo(oracleFeedAccount1.publicKey)
    assert.ok(new anchor.BN(parsePriceData(oracleFeedAccountInfo1.data).price).eq(new anchor.BN(oracleInitPrice1)))
  })

  it('Factory: Initializes', async () => {
    const tx = await factory.rpc.initialize(exchange.programId, {
      accounts: {
        authority: provider.wallet.publicKey,
        factory: factoryAccount.publicKey,
        systemProgram: SystemProgram.programId
      },
      signers: [factoryAccount]
    })

    console.log('Your transaction signature', tx)

    let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)
    assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(0)))
    assert.ok(factoryAccountInfo.exchangeTemplate.toString() == exchange.programId.toString())
  })

  it('Factory: Creates first exchange', async () => {
    const fee0 = new anchor.BN(3)
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    )
    const tx = await factory.rpc.createExchange(
      fee0, {
        accounts: {
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          exchangeProgram: exchange.programId,
          factory: factoryAccount.publicKey,
          tokenC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenV: token0V.publicKey
        },
        instructions: [await exchange.account.exchangeData.createInstruction(exchangeAccount0)],
        signers: [factoryAccount.owner, exchangeAccount0]
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
    assert.ok(exchangeTokenAccountInfo0V.amount.eq(new anchor.BN(0)))
    assert.ok(exchangeTokenAccountInfo0V.owner.equals(pda))

    let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)
    assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(1)))
  })

  const initialMaxAmountA = 10000 * (10 ** decimals0V)
  const initialAmountB = 10000 * (10 ** decimals0V)
  const initialMinBondC = 0
  const initialBondMinted = 10000 * (10 ** decimalsC)

  it('Exchange: Bonds', async () => {
    const tx = await exchange.rpc.bond(
      new anchor.BN(initialMaxAmountA),
      new anchor.BN(initialAmountB),
      new anchor.BN(initialMinBondC),
      new anchor.BN(Date.now() / 1000), {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          mintC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userV: walletTokenAccount0V
        }
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
    let walletTokenAccountInfo0V = await token0V.getAccountInfo(walletTokenAccount0V)
    assert.ok(exchangeTokenAccountInfo0V.amount.eq(new anchor.BN(initialMaxAmountA)))
    assert.ok(walletTokenAccountInfo0V.amount.eq(new anchor.BN(walletAmount0V - initialMaxAmountA)))

    let walletTokenAccountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
    assert.ok(walletTokenAccountInfoC.amount.eq(new anchor.BN(initialBondMinted)))
  })

  const stakeAmount = initialBondMinted / 2

  it('Factory: Stakes', async () => {
    const tx = await factory.rpc.stake(
      new anchor.BN(stakeAmount), {
        accounts: {
          authority: provider.wallet.publicKey,
          factoryC: factoryTokenAccountC,
          mintS: tokenS.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userS: walletTokenAccountS
        }
      }
    )

    console.log('Your transaction signature', tx)

    let factoryTokenAccountInfoC = await tokenC.getAccountInfo(factoryTokenAccountC)
    assert.ok(factoryTokenAccountInfoC.amount.eq(new anchor.BN(stakeAmount)))

    let walletTokenAccountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
    let walletTokenAccountInfoS = await tokenS.getAccountInfo(walletTokenAccountS)
    assert.ok(walletTokenAccountInfoC.amount.eq(new anchor.BN(initialBondMinted - stakeAmount)))
    assert.ok(walletTokenAccountInfoS.amount.eq(new anchor.BN(stakeAmount)))
  })

  const additionalMaxAmountA = 15000 * (10 ** decimals0V)
  const additionalAmountB = 15000 * (10 ** decimals0V)
  const additionalMinBondC = 375 * (10 ** decimalsC)
  const additionalBondMinted = 375 * (10 ** decimalsC)

  it('Exchange: Bonds additional', async () => {
    const deadline = new anchor.BN(Date.now() / 1000)
    const tx = await exchange.rpc.bond(
      new anchor.BN(additionalMaxAmountA),
      new anchor.BN(additionalAmountB),
      new anchor.BN(additionalMinBondC),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          mintC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userV: walletTokenAccount0V
        }
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
    let walletTokenAccountInfo0V = await token0V.getAccountInfo(walletTokenAccount0V)
    assert.ok(exchangeTokenAccountInfo0V.amount.eq(new anchor.BN(initialMaxAmountA + additionalMaxAmountA)))
    assert.ok(walletTokenAccountInfo0V.amount.eq(new anchor.BN(walletAmount0V - initialMaxAmountA - additionalMaxAmountA)))

    let walletTokenAccountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
    //assert.ok(walletTokenAccountInfoC.amount.eq(new anchor.BN(initialBondMinted + additionalBondMinted)))
  })

  const traderInputQuoteAccount = anchor.web3.Keypair.generate()
  const aToBAmount = 10 * (10 ** decimals0V)

  it('Exchange: Gets input price', async () => {
    const tx = await exchange.rpc.getBToAInputPrice(
      new anchor.BN(aToBAmount),
      {
        accounts: {
          authority: provider.wallet.publicKey,
          exchange: exchangeAccount0.publicKey,
          quote: traderInputQuoteAccount.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [traderInputQuoteAccount]
      })

    console.log('Your transaction signature', tx)

    let traderInputAccountQuoteInfo = await exchange.account.quote.fetch(traderInputQuoteAccount.publicKey)
    //assert.ok(traderInputAccountQuoteInfo.price.eq(new anchor.BN(48 ** decimals0B)))
  })

  const traderOutputQuoteAccount = anchor.web3.Keypair.generate()
  const bToAAmount = 5 * (10 ** decimals0V)

  it('Exchange: Gets output price', async () => {
    const tx = await exchange.rpc.getBToAOutputPrice(
      new anchor.BN(bToAAmount),
      {
        accounts: {
          authority: provider.wallet.publicKey,
          exchange: exchangeAccount0.publicKey,
          quote: traderOutputQuoteAccount.publicKey,
          systemProgram: SystemProgram.programId
        },
        signers: [traderOutputQuoteAccount]
      })

    console.log('Your transaction signature', tx)

    let traderOutputQuoteAccountInfo = await exchange.account.quote.fetch(traderOutputQuoteAccount.publicKey)
    //assert.ok(traderOutputQuoteAccountInfo.price.eq(new anchor.BN(4)))
  })

  const aToBAmountA = 3 * (10 ** decimals1V)

  it('Exchange: A to B input', async () => {
    const index = 0
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    )
    const [positionPda, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [token0V.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
      exchange.programId
    )
    const deadline = Date.now() / 1000
    const tx = await exchange.rpc.aToBInput(
      new anchor.BN(aToBAmountA),
      bump,
      new anchor.BN(deadline),
      Direction.Short,
      new anchor.BN(aToBAmountA),
      new anchor.BN(index),
      {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          pda,
          position: positionPda,
          recipient: walletTokenAccount0V,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          userV: walletTokenAccount0V
        }
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccount0VInfo = await token0V.getAccountInfo(exchangeTokenAccount0V)
    let walletTokenAccount0VInfo = await token0V.getAccountInfo(walletTokenAccount0V)
    //assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(206)))
    //assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(99794)))

    //let exchangeTokenAccount0BInfo = await token0B.getAccountInfo(exchangeTokenAccount0B)
    //let walletTokenAccount0BInfo = await token0B.getAccountInfo(walletTokenAccount0B)
    //assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(150)))
    //assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(99850)))

    let exchangeAccount0Info = await exchange.account.exchangeData.fetch(exchangeAccount0.publicKey)
    //assert.ok(exchangeAccount0Info.lastPrice.eq(new anchor.BN(19)))
  })

  const bToAAmountB = 6 * (10 ** decimals0V)

  //it('Exchange: B to A input', async () => {
  //  const index = 1
  //  const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
  //    [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
  //    exchange.programId
  //  )
  //  const [positionPda, bump] = await anchor.web3.PublicKey.findProgramAddress(
  //    [token0V.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
  //    exchange.programId
  //  )
  //  const deadline = Date.now() / 1000
  //  const tx = await exchange.rpc.bToAInput(
  //    new anchor.BN(bToAAmountB),
  //    bump,
  //    new anchor.BN(deadline),
  //    Direction.Long,
  //    new anchor.BN(bToAAmountB),
  //    new anchor.BN(index),
  //    {
  //      accounts: {
  //        authority: provider.wallet.publicKey,
  //        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
  //        exchange: exchangeAccount0.publicKey,
  //        exchangeV: exchangeTokenAccount0V,
  //        pda,
  //        position: positionPda,
  //        recipient: walletTokenAccount0V,
  //        systemProgram: SystemProgram.programId,
  //        tokenProgram: TOKEN_PROGRAM_ID,
  //        userV: walletTokenAccount0V
  //      }
  //    })

  //  console.log('Your transaction signature', tx)

  //  let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
  //  let walletTokenAccountInfo0V = await token0V.getAccountInfo(walletTokenAccount0V)
  //  //assert.ok(exchangeTokenAccountInfo0V.amount.eq(new anchor.BN(218)))
  //  //assert.ok(walletTokenAccountInfo0V.amount.eq(new anchor.BN(99782)))

  //  //let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
  //  //let walletTokenAccountInfo0V = await token0V.getAccountInfo(walletTokenAccount0V)
  //  //assert.ok(exchangeTokenAccountInfo0B.amount.eq(new anchor.BN(131)))
  //  //assert.ok(walletTokenAccountInfo0B.amount.eq(new anchor.BN(99869)))

  //  let exchangeAccountInfo0 = await exchange.account.exchangeData.fetch(exchangeAccount0.publicKey)
  //  //assert.ok(exchangeAccountInfo0.lastPrice.eq(new anchor.BN(6)))
  //})

  const unbondAmountC = 87

  it('Exchange: Unbonds', async () => {
    const tx = await exchange.rpc.unbond(
      new anchor.BN(unbondAmountC),
      new anchor.BN(Date.now() / 1000), {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          mintC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userV: walletTokenAccount0V  // Not working because this is a wrapped SOL account
        }
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccountInfo0V = await token0V.getAccountInfo(exchangeTokenAccount0V)
    let walletTokenAccountInfo0V = await token0V.getAccountInfo(walletTokenAccount0V)
    //assert.ok(exchangeTokenAccountInfo0V.amount.eq(new anchor.BN(0)))
    //assert.ok(walletTokenAccountInfo0V.amount.eq(new anchor.BN(amount0V)))

    let walletTokenAccountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
    //assert.ok(walletTokenAccountInfoC.amount.eq(new anchor.BN(0)))
  })

  const finalMaxAmount0A = 1700 * (10 ** decimals0V)
  const finalAmount0B = 750 * (10 ** decimals0V)
  const finalMinBond0C = 340 * (10 ** decimalsC)
  const finalBondMinted0 = 350 * (10 ** decimalsC)

  it('Exchange: Bonds final', async () => {
    const deadline = new anchor.BN(Date.now() / 1000)
    const tx = await exchange.rpc.bond(
      new anchor.BN(finalMaxAmount0A),
      new anchor.BN(finalAmount0B),
      new anchor.BN(finalMinBond0C),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount0.publicKey,
          exchangeV: exchangeTokenAccount0V,
          mintC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userV: walletTokenAccount0V
        }
      })

    console.log('Your transaction signature', tx)

    //let exchangeTokenAccount0AInfo = await token0A.getAccountInfo(exchangeTokenAccount0A)
    //let walletTokenAccount0AInfo = await token0A.getAccountInfo(walletTokenAccount0A)
    //assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(additionalMaxAmountA)))
    //assert.ok(walletTokenAccount0AInfo.amount.eq(new anchor.BN(99850)))

    //let exchangeTokenAccount0BInfo = await token0B.getAccountInfo(exchangeTokenAccount0B)
    //let walletTokenAccount0BInfo = await token0B.getAccountInfo(walletTokenAccount0B)
    //assert.ok(walletTokenAccount0BInfo.amount.eq(new anchor.BN(99925)))

    let walletTokenAccountCInfo = await tokenC.getAccountInfo(walletTokenAccountC)
    //assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(75)))
  })

  it('Factory: Creates second exchange', async () => {
    const fee1 = new anchor.BN(3)
    const [pda, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('exchange'))],
      exchange.programId
    )
    const tx = await factory.rpc.createExchange(
      fee1, {
        accounts: {
          exchange: exchangeAccount1.publicKey,
          exchangeV: exchangeTokenAccount1V,
          exchangeProgram: exchange.programId,
          factory: factoryAccount.publicKey,
          tokenC: tokenC.publicKey,
          tokenV: token1V.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID
        },
        instructions: [await exchange.account.exchangeData.createInstruction(exchangeAccount1)],
        signers: [factoryAccount.owner, exchangeAccount1]
      })

    console.log('Your transaction signature', tx)

    //let exchangeTokenAccount0AInfo = await token0A.getAccountInfo(exchangeTokenAccount0A)
    //assert.ok(exchangeTokenAccount0AInfo.amount.eq(new anchor.BN(0)))

    //let exchangeTokenAccount0BInfo = await token0B.getAccountInfo(exchangeTokenAccount0B)
    //assert.ok(exchangeTokenAccount0BInfo.amount.eq(new anchor.BN(0)))
    //assert.ok(exchangeTokenAccount0AInfo.owner.equals(pda))
    //assert.ok(exchangeTokenAccount0BInfo.owner.equals(pda))

    //let factoryAccountInfo = await factory.account.factoryData.fetch(factoryAccount.publicKey)
    //assert.ok(factoryAccountInfo.tokenCount.eq(new anchor.BN(1)))
  })

  const finalMaxAmount1A = 1000 * (10 ** decimals1V)
  const finalAmount1B = 1000 * (10 ** decimals1V)
  const finalMinBond1C = 0
  const finalBondMinted1 = 1000 * (10 ** decimalsC)

  it('Exchange: Bonds', async () => {
    const deadline = new anchor.BN(Date.now() / 1000)
    const tx = await exchange.rpc.bond(
      new anchor.BN(finalMaxAmount1A),
      new anchor.BN(finalAmount1B),
      new anchor.BN(finalMinBond1C),
      deadline, {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          exchange: exchangeAccount1.publicKey,
          exchangeV: exchangeTokenAccount1V,
          mintC: tokenC.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          userC: walletTokenAccountC,
          userV: walletTokenAccount1V
        }
      })

    console.log('Your transaction signature', tx)

    let exchangeTokenAccountInfo1V = await token1V.getAccountInfo(exchangeTokenAccount1V)
    let walletTokenAccountInfo1V = await token1V.getAccountInfo(walletTokenAccount1V)
    assert.ok(exchangeTokenAccountInfo1V.amount.eq(new anchor.BN(finalMaxAmount1A)))
    //assert.ok(walletTokenAccountInfo1V.amount.eq(new anchor.BN(amount1V - finalMaxAmount1A)))

    let walletTokenAccountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
    //assert.ok(walletTokenAccountCInfo.amount.eq(new anchor.BN(finalBondMinted1)))
  })
})
