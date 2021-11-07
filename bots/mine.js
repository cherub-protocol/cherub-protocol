const {
  ASSOCIATED_TOKEN_PROGRAM_ID, BN, TOKEN_PROGRAM_ID, SYSVAR_CLOCK_PUBKEY, PublicKey, SystemProgram, Token,
  Direction, Status, init, sleep, toBuffer
} = require('../sdk/src')

const config = init()

const provider = config.provider
const accounts = config.accounts

const exchange = config.programs.exchange
const factory = config.programs.factory

const tokenV = new Token(provider.connection, new PublicKey(accounts.exchanges[0].tokenV), TOKEN_PROGRAM_ID, provider.wallet.payer)
const decimalsV = 9
const walletAmountV = 1000000 * (10 ** decimalsV)

async function main() {
  console.log('Running....')

  const [exchangePda, exchangeBump] = await PublicKey.findProgramAddress([tokenV.publicKey.toBuffer()], exchange.programId)

  const walletTokenAccountV = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenV.publicKey,
    provider.wallet.publicKey
  )

  await tokenV.mintTo(walletTokenAccountV, provider.wallet.publicKey, [], walletAmountV)

  while (true) {
    // TODO: Apply funding and liquidate positions

    let tx

    const [walletMetaPda, walletMetaBump] = await PublicKey.findProgramAddress([
      toBuffer('meta'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()
    ], exchange.programId)
    const exchangeMetaDataAccountInfo = await exchange.account.metaData.fetch(walletMetaPda)
    const positions = exchangeMetaDataAccountInfo.positions.toNumber()

    const [positionPda, positionBump] = await PublicKey.findProgramAddress([
      toBuffer('position'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer(), toBuffer(Math.floor((Math.random() * positions)))
    ], exchange.programId)
    const positionDataAccount = await exchange.account.positionData.fetch(positionPda)

    if (positionDataAccount.status.open) {
      const amount = positionDataAccount.amount.toNumber()
      const deadline = Date.now() / 1000
      const displayAmount = (amount / (10 ** decimalsV)).toString() + ' USD'
      const direction = positionDataAccount.direction
      const equity = positionDataAccount.equity.toNumber()
      const leverage = amount / equity

      const args = {
        accounts: {
          authority: provider.wallet.publicKey,
          clock: SYSVAR_CLOCK_PUBKEY,
          exchange: new PublicKey(accounts.exchanges[0].account),
          exchangeV: new PublicKey(accounts.exchanges[0].accountV),
          meta: walletMetaPda,
          pda: exchangePda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          userV: walletTokenAccountV
        }
      }

      console.log('Closing', leverage.toFixed(0) + 'x leverage', direction.long ? 'long' : 'short', 'for', displayAmount + '...')

      const tx = await exchange.rpc.positionUpdate(new BN(amount), positionBump, new BN(deadline), new BN(equity), args)

      console.log('Transaction signature', tx)
    }
  }

  await sleep(5000)
}

main()
