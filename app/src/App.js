import 'antd/dist/antd.css'
import '@solana/wallet-adapter-react-ui/styles.css'
import './App.css'

import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token'
import {
  Alert, Button, Card, Col, Dropdown, Input, Layout, List, Modal, Menu, Radio, Row, Select, Slider, Steps, Table, Typography, notification
} from 'antd'
import { BN, Program, Provider, utils } from '@project-serum/anchor'
import {
  BankOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, DollarOutlined, DownOutlined, HistoryOutlined, PieChartOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { Connection, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram, clusterApiUrl } from '@solana/web3.js'
import { ConnectionProvider, WalletProvider, useWallet  } from '@solana/wallet-adapter-react'
import { Line } from 'react-chartjs-2'
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { getPhantomWallet, getSlopeWallet, getSolletWallet } from '@solana/wallet-adapter-wallets'
import { parsePriceData } from '@pythnetwork/client'
import { useEffect, useCallback, useState } from 'react'

import daoIdl from './dao.json'
import exchangeIdl from './exchange.json'
import factoryIdl from './factory.json'
import pythIdl from './pyth.json'

const { Content, Footer, Header } = Layout
const { Option } = Select
const { Step } = Steps
const { Title } = Typography

const IS_LOCALNET = window.location.origin === 'http://localhost:3000'

let accounts = {}

if (IS_LOCALNET) {
  accounts = require('./accounts-localnet.json')
} else {
  accounts = require('./accounts-devnet.json')
}

const C_SYMBOL = 'CHRB'
const DEFAULT_SYMBOL = accounts.exchanges[0].symbol
const githubUrl = 'https://github.com/cherub-so/cherub-protocol'
const network = IS_LOCALNET ? 'http://127.0.0.1:8899' : clusterApiUrl('devnet')
const opts = { preflightCommitment: 'processed' }
const wallets = [getPhantomWallet(), getSolletWallet(), getSlopeWallet()]

const Direction = {
  Long: { long: {} },
  Short: { short: {} }
}

const chartOptions = {
  scales: {
    x: {
      display: true,
      grid: { display: false }
    },
    y: {
      display: true,
      grid: { display: false }
    }
  },
  plugins: {
    legend: { display: false }
  }
}

const bondsColumns = [{
  title: 'Quantity',
  dataIndex: 'quantity',
  key: 'quantity'
}, {
  title: 'Length',
  dataIndex: 'length',
  key: 'length'
}, {
  title: 'Status',
  dataIndex: 'status',
  key: 'status'
}]

const inversePositionsColumns = [{
  title: 'Quantity',
  dataIndex: 'quantity',
  key: 'quantity'
}, {
  title: 'Entry',
  dataIndex: 'entry',
  key: 'entry'
}, {
  title: 'Equity',
  dataIndex: 'equity',
  key: 'equity'
}, {
  title: 'Direction',
  dataIndex: 'direction',
  key: 'direction'
}, {
  title: 'Status',
  dataIndex: 'status',
  key: 'status'
}]

const stakePositionsColumns = [{
  title: 'Quantity',
  dataIndex: 'quantity',
  key: 'quantity'
}, {
  title: 'APY',
  dataIndex: 'apy',
  key: 'apy'
}]

const treasuryData = {
  datasets: [{
    backgroundColor: '#69c0ff',
    borderColor: '#40a9ff',
    data: [0, 7, 6, 10, 24, 51, 54, 176],
    fill: true
  }],
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
}

const tvdData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  datasets: [{
    backgroundColor: '#69c0ff',
    borderColor: '#40a9ff',
    data: [0, 5, 10, 33, 35, 51, 54, 76],
    fill: true
  }]
}

function currencyFormat(x) {
  return '$' + x.toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

function getWindowRoute() {
  const routes = ['dao', 'inverse', 'stake', 'bond']
  if (window.location.href.split('#/').length === 2 && routes.indexOf(window.location.href.split('#/')[1]) >= 0) {
    return window.location.href.split('#/')[1]
  } else {
    // First route is default route
    return routes[0]
  }
}

function toBuffer(x) {
  return Buffer.from(utils.bytes.utf8.encode(x))
}

function App() {
  const [balance, setBalance] = useState(0)
  const [blockHeight, setBlockHeight] = useState(0)
  const [bondCard, setBondCard] = useState('bond')
  const [bondDeposit, setBondDeposit] = useState()
  const [bonds, setBonds] = useState([])
  const [cBalance, setCBalance] = useState(0)
  const [cCirculatingSupplyTotal, setCCirculatingSupplyTotal] = useState('0 / 0')
  const [cCurrentPrice, setCCurrentPrice] = useState(0)
  const [cMarketCap, setCMarketCap] = useState(0)
  const [change24H, setChange24H] = useState()
  const [countdown, setCountdown] = useState()
  const [daoCard, setDAOCard] = useState('statistics')
  const [daoProposals, setDaoProposals] = useState([])
  const [exchangeRate, setExchangeRate] = useState(0)
  const [fundingRate, setFundingRate] = useState()
  // eslint-disable-next-line
  const [gasFee, setGasFee] = useState()
  const [high24H, setHigh24H] = useState()
  const [isBlockHeightIntervalSet, setIsBlockHeightIntervalSet] = useState(false)
  const [isCountdownIntervalSet, setIsCountdownIntervalSet] = useState(false)
  const [isInverseAssetModalVisible, setIsInverseAssetModalVisible] = useState(false)
  const [isInverseDataSet, setIsInverseDataSet] = useState(false)
  const [isUserDataSet, setIsUserDataSet] = useState(false)
  const [indexPrice, setIndexPrice] = useState()
  const [inverseAsset, setInverseAsset] = useState(DEFAULT_SYMBOL)
  const [inverseCard, setInverseCard] = useState('inverse')
  const [inverseDirection, setInverseDirection] = useState('long')
  const [inverseQuantity, setInverseQuantity] = useState()
  const [inversePositions, setInversePositions] = useState([])
  const [inverseStep, setInverseStep] = useState(0)
  const [leverage, setLeverage] = useState(1)
  const [low24H, setLow24H] = useState()
  const [marketPrice, setCurrentMarketPrice] = useState(0)
  const [menu, setMenu] = useState('')
  const [stakeCard, setStakeCard] = useState('stake')
  const [stakeDeposit, setStakeDeposit] = useState()
  const [stakeStep, setStakeStep] = useState(0)
  const [stakePositions, setStakePositions] = useState([])
  const [tokenCount, setTokenCount] = useState(0)
  const [turnaround24H, setTurnaround24H] = useState()

  const wallet = useWallet()

  const getProviderCallback = useCallback(getProvider, [getProvider])

  const getBalanceCallback = useCallback(getBalance, [getProviderCallback, wallet.connected])
  const getBlockHeightCallback = useCallback(getBlockHeight, [getProviderCallback])
  const getCBalanceCallback = useCallback(getCBalance, [getProviderCallback])
  const getDashboardDataCallback = useCallback(getDashboardData, [getProviderCallback])
  const getInverseDataCallback = useCallback(getInverseData, [getProviderCallback])
  const getPositionsCallback = useCallback(getPositions, [getProviderCallback])
  const getStakesCallback = useCallback(getStakes, [getProviderCallback])

  async function getProvider() {
    const connection = new Connection(network, opts.preflightCommitment)
    return new Provider(connection, wallet, opts.preflightCommitment)
  }

  function getBlockHeight() {
    getProviderCallback().then((provider) => {
      provider.connection.getEpochInfo().then(function(epochInfo) {
        setBlockHeight(epochInfo.blockHeight)
      })
    })
  }

  async function getStakes() {
    const provider = await getProviderCallback()

    const factory = new Program(factoryIdl, new PublicKey(factoryIdl.metadata.address), provider)
    const tokenC = new Token(provider.connection, new PublicKey(accounts.factory.tokenC), TOKEN_PROGRAM_ID, null)
    const mintInfoC = await tokenC.getMintInfo()

    let factoryMetaDataAccountInfo

    try {
      // eslint-disable-next-line
      let [walletMetaPda, walletMetaBump] = await PublicKey.findProgramAddress(
        [toBuffer('meta'), provider.wallet.publicKey.toBuffer()],
        factory.programId
      )
      factoryMetaDataAccountInfo = await factory.account.metaData.fetch(walletMetaPda)
    } catch (err) {
      console.log(err)
      return
    }

    try {
      let stakes = []
      for (let i = 0; i < factoryMetaDataAccountInfo.stakes.toNumber(); i++) {
        // eslint-disable-next-line
        const [stakePda, stakeBump] = await PublicKey.findProgramAddress([
          toBuffer('stake'), provider.wallet.publicKey.toBuffer(), toBuffer(i)
        ], factory.programId)
        const stakeDataAccount = await factory.account.stakeData.fetch(stakePda)
        if (stakeDataAccount) {
          stakes.push({
            quantity: (stakeDataAccount.quantity.toNumber() / (10 ** mintInfoC.decimals)).toFixed(2),
            apy: '13%',
            key: i,
          })
        }
      }
      setStakePositions(stakes)
    } catch (err) {
      setStakePositions([])
      console.log(err)
    }
  }

  async function getPositions(symbol) {
    const provider = await getProviderCallback()
    const exchange = new Program(exchangeIdl, new PublicKey(exchangeIdl.metadata.address), provider)

    const tokenV = new Token(provider.connection, new PublicKey(accounts.exchanges.find((x) => x.symbol === symbol).tokenV), TOKEN_PROGRAM_ID, null)
    const mintInfoV = await tokenV.getMintInfo()

    let exchangeMetaDataAccountInfo

    try {
      // eslint-disable-next-line
      let [walletMetaPda, walletMetaBump] = await PublicKey.findProgramAddress(
        [toBuffer('meta'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
        exchange.programId
      )
      exchangeMetaDataAccountInfo = await exchange.account.metaData.fetch(walletMetaPda)
    } catch (err) {
      console.log(err)
      return
    }

    try {
      let positions = []
      for (let i = 0; i < exchangeMetaDataAccountInfo.positions.toNumber(); i++) {
        // eslint-disable-next-line
        const [positionPda, positionBump] = await PublicKey.findProgramAddress([
          toBuffer('position'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer(), toBuffer(i)
        ], exchange.programId)
        const positionDataAccount = await exchange.account.positionData.fetch(positionPda)

        if (positionDataAccount) {
          positions.push({
            direction: positionDataAccount.direction.long ? 'Long' : 'Short',
            entry: (positionDataAccount.entry.toNumber() / (10 ** mintInfoV.decimals)).toFixed(2),
            equity: (positionDataAccount.equity.toNumber() / (10 ** mintInfoV.decimals)).toFixed(2),
            key: i,
            quantity: (positionDataAccount.quantity.toNumber() / (10 ** mintInfoV.decimals)).toFixed(2),
            status: positionDataAccount.status.open ? 'Open' : (positionDataAccount.status.closed ? 'Closed' : 'Liquidated')
          })
        }
      }
      setInversePositions(positions)
    } catch (err) {
      setInversePositions([])
      console.log(err)
    }

    try {
      let bonds = []
      for (let i = 0; i < exchangeMetaDataAccountInfo.bonds.toNumber(); i++) {
        // eslint-disable-next-line
        const [bondPda, bondBump] = await PublicKey.findProgramAddress([
          toBuffer('bond'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer(), toBuffer(i)
        ], exchange.programId)
        const bondDataAccount = await exchange.account.bondData.fetch(bondPda)

        if (bondDataAccount) {
          bonds.push({
            quantity: (bondDataAccount.quantity.toNumber() / (10 ** mintInfoV.decimals)).toFixed(2),
            key: i,
          })
        }
      }
      setBonds(bonds)
    } catch (err) {
      setBonds([])
      console.log(err)
    }
  }

  async function getCBalance() {
    try {
      const provider = await getProviderCallback()
      const tokenC = new Token(provider.connection, new PublicKey(accounts.factory.tokenC), TOKEN_PROGRAM_ID)

      const walletTokenAccountC = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenC.publicKey,
        provider.wallet.publicKey
      )
      const accountInfoC = await tokenC.getAccountInfo(walletTokenAccountC)
      const mintInfoC = await tokenC.getMintInfo()
      setCBalance((accountInfoC.amount.toNumber() / (10 ** mintInfoC.decimals)).toFixed(2))
    } catch (err) {
      setCBalance()
      console.log(err)
    }
  }

  async function getBalance(symbol) {
    try {
      if (wallet.connected) {
        const provider = await getProviderCallback()

        const pk = new PublicKey(accounts.exchanges.find((x) => x.symbol === symbol).tokenV)
        const tokenV = new Token(provider.connection, pk, TOKEN_PROGRAM_ID)

        const walletTokenAccountV = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenV.publicKey,
          provider.wallet.publicKey
        )
        const accountInfoV = await tokenV.getAccountInfo(walletTokenAccountV)
        const mintInfoV = await tokenV.getMintInfo()
        setBalance((accountInfoV.amount.toNumber() / (10 ** mintInfoV.decimals)).toFixed(2))
      }
    } catch (err) {
      console.log(err)
    }
  }

  async function getDashboardData() {
    try {
      const provider = await getProviderCallback()
      const factory = new Program(factoryIdl, new PublicKey(factoryIdl.metadata.address), provider)

      const tokenC = new Token(provider.connection, new PublicKey(accounts.factory.tokenC), TOKEN_PROGRAM_ID)
      const tokenS = new Token(provider.connection, new PublicKey(accounts.factory.tokenS), TOKEN_PROGRAM_ID)
      const mintInfoC = await tokenC.getMintInfo()
      const mintInfoS = await tokenS.getMintInfo()

      const supplyS = mintInfoS.supply.toNumber() / (10 ** mintInfoS.decimals)
      const supplyC = mintInfoC.supply.toNumber() / (10 ** mintInfoC.decimals)
      setCCirculatingSupplyTotal((supplyC - supplyS).toFixed(0) + ' / ' + supplyC.toFixed(0))

      const lastPrice = (1000).toFixed(2)
      setCCurrentPrice(currencyFormat(lastPrice / 1))
      setCMarketCap(currencyFormat(lastPrice * supplyC))

      const factoryAccount = await factory.account.factoryData.fetch(new PublicKey(accounts.factory.account))
      setTokenCount(factoryAccount.tokens.toNumber())

      const dao = new Program(daoIdl, new PublicKey(daoIdl.metadata.address), provider)
      const daoAccount = await dao.account.daoData.fetch(new PublicKey(accounts.dao.account))

      const proposals = []
      for (var i = 0; i < daoAccount.proposals.toNumber(); i++) {
        // eslint-disable-next-line
        const [proposalPda, bump] = await PublicKey.findProgramAddress([toBuffer(i)], dao.programId)
        const proposalAccount = await dao.account.proposalData.fetch(proposalPda)
        const deadlineDate = new Date(proposalAccount.deadline.toNumber() * 1000)
        const deadline = deadlineDate.toLocaleDateString('en-us', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric'})

        let icon = (<CloseCircleOutlined className='CloseCircleOutlined'/>)
        if (deadlineDate > new Date()) {
          icon = <CheckCircleOutlined className='ClockCircleOutlined'/>
        } else {
          icon = <ClockCircleOutlined className='ClockCircleOutlined'/>
        }

        proposals.push({
          description: <><code>{proposalAccount.index.toNumber()}</code> • Voting deadline is {deadline}</>,
          icon: icon,
          title: proposalAccount.description,
          key: proposalAccount.index
        })
      }
      proposals.reverse()
      setDaoProposals(proposals)
    } catch (err) {
      console.log(err)
    }
  }

  function setDummyInverseData(lastPrice, indexPrice) {
    setChange24H('+' + (lastPrice > 0 ? (Math.random() / 100 + 2).toFixed(2) : 0))
    setFundingRate(lastPrice > 0 ? ((lastPrice - indexPrice) / 1000).toFixed(4) : 0)
    setHigh24H((lastPrice * (Math.random() / 100 + 1.1)).toFixed(2))
    setLow24H((lastPrice * (Math.random() / 100 + 0.9)).toFixed(2))
    setTurnaround24H((lastPrice * (Math.random() * 10000 + 1.3)).toFixed(0))
  }

  async function getInverseData(asset) {
    try {
      const currentExchange = accounts.exchanges.find((x) => x.symbol === asset)
      const provider = await getProviderCallback()
      const exchangePublicKey = new PublicKey(accounts.exchanges.find((x) => x.symbol === asset).account)
      const exchange = new Program(exchangeIdl, new PublicKey(exchangeIdl.metadata.address), provider)

      const exchangeAccount = await exchange.account.exchangeData.fetch(exchangePublicKey)
      const mintAPublicKey = accounts.exchanges.find((x) => x.symbol === asset).tokenV
      const tokenV = new Token(provider.connection, new PublicKey(mintAPublicKey), TOKEN_PROGRAM_ID, null)
      const mintAInfo = await tokenV.getMintInfo()
      const lastPrice = (exchangeAccount.lastPrice.toNumber() / (10 ** mintAInfo.decimals)).toFixed(2)

      const pyth = new Program(pythIdl, new PublicKey(pythIdl.metadata.address), provider)
      const pythFeedAccountInfo = await pyth.provider.connection.getAccountInfo(new PublicKey(currentExchange.oracle))
      const indexPrice = parsePriceData(pythFeedAccountInfo.data).price

      setCurrentMarketPrice(lastPrice)
      setIndexPrice(indexPrice.toFixed(2))
      setExchangeRate((1 / lastPrice).toFixed(4))
      setDummyInverseData(lastPrice, indexPrice)
    } catch (err) {
      console.log(err)
    }

    setInverseStep(0)
    setInverseQuantity()
  }

  async function approveInverse() {
    let message
    let description

    try {
      const currentExchange = accounts.exchanges.find((x) => x.symbol === inverseAsset)

      const provider = await getProviderCallback()
      const exchange = new Program(exchangeIdl, new PublicKey(exchangeIdl.metadata.address), provider)

      const tokenV = new Token(provider.connection, new PublicKey(currentExchange.tokenV), TOKEN_PROGRAM_ID)
      const mintInfoV = await tokenV.getMintInfo()
      const walletTokenAccountV = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenV.publicKey,
        provider.wallet.publicKey
      )

      // eslint-disable-next-line
      const [exchangePda, exchangeBump] = await PublicKey.findProgramAddress([tokenV.publicKey.toBuffer()], exchange.programId)
      // eslint-disable-next-line
      const [metaPda, metaBump] = await PublicKey.findProgramAddress(
        [toBuffer('meta'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
        exchange.programId
      )
      const metaDataAccountInfo = await exchange.account.metaData.fetch(metaPda)
      const positions = metaDataAccountInfo.positions.toNumber()
      const [positionPda, positionBump] = await PublicKey.findProgramAddress([
        toBuffer('position'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer(), toBuffer(positions)
      ], exchange.programId)
      const bToAAmountB = inverseQuantity * leverage * (10 ** mintInfoV.decimals)
      const equityB = inverseQuantity * (10 ** mintInfoV.decimals)

      const tx = await exchange.rpc.bToAInput(
        new BN(bToAAmountB),
        positionBump,
        new BN(Date.now() + 5000 / 1000),
        inverseDirection === 'long' ? Direction.Long : Direction.Short,
        new BN(equityB),
        {
          accounts: {
            authority: provider.wallet.publicKey,
            clock: SYSVAR_CLOCK_PUBKEY,
            exchange: new PublicKey(currentExchange.account),
            exchangeV: currentExchange.accountV,
            meta: metaPda,
            pda: exchangePda,
            position: positionPda,
            recipient: walletTokenAccountV,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            userV: walletTokenAccountV
          }
        })
      const link = 'https://explorer.solana.com/tx/' + tx

      message = 'Order Successfully Placed'
      description = (<div>Your transaction signature is <a href={link} rel='noreferrer' target='_blank'><code>{tx}</code></a></div>)

      setInverseStep(0)
      setLeverage(1)
      setInverseQuantity()

      getPositions(currentExchange.symbol)
      getInverseData(currentExchange.symbol)
      getBalance(currentExchange.symbol)
    } catch (err) {
      description = 'Transaction error'
      message = 'Order Error'
      console.log(err)
    }

    notification.open({message: message, description: description, duration: 0, placement: 'bottomLeft'})
  }

  async function approveBond() {
    let message
    let description

    try {
      const currentExchange = accounts.exchanges.find((x) => x.symbol === inverseAsset)
      const provider = await getProviderCallback()
      const exchange = new Program(exchangeIdl, new PublicKey(exchangeIdl.metadata.address), provider)

      const tokenC = new Token(provider.connection, new PublicKey(accounts.factory.tokenC), TOKEN_PROGRAM_ID)
      const tokenV = new Token(provider.connection, new PublicKey(currentExchange.tokenV), TOKEN_PROGRAM_ID)

      const mintInfoV = await tokenV.getMintInfo()

      const walletTokenAccountC = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenC.publicKey,
        provider.wallet.publicKey
      )
      const walletTokenAccountV = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenV.publicKey,
        provider.wallet.publicKey
      )

      const maxAmountA = bondDeposit * (10 ** mintInfoV.decimals)
      const amountB = (maxAmountA / (marketPrice * (10 ** mintInfoV.decimals))) * (10 ** mintInfoV.decimals)
      const minLiquidityC = amountB / 1000
      // eslint-disable-next-line
      const [exchangePda, exchangeBump] = await PublicKey.findProgramAddress([tokenV.publicKey.toBuffer()], exchange.programId)

      // eslint-disable-next-line
      const [metaPda, metaBump] = await PublicKey.findProgramAddress(
        [toBuffer('meta'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
        exchange.programId
      )
      const metaDataAccountInfo = await exchange.account.metaData.fetch(metaPda)
      const bonds = metaDataAccountInfo.bonds.toNumber()
      const [bondPda, bondBump] = await PublicKey.findProgramAddress(
        [toBuffer('bond'), tokenV.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer(), toBuffer(bonds)],
        exchange.programId
      )

      const tx = await exchange.rpc.bond(
        new BN(amountB.toFixed(0)),
        bondBump,
        new BN(Date.now() + 5000 / 1000),
        new BN(maxAmountA.toFixed(0)),
        new BN(minLiquidityC.toFixed(0)), {
          accounts: {
            authority: provider.wallet.publicKey,
            bond: bondPda,
            clock: SYSVAR_CLOCK_PUBKEY,
            exchange: currentExchange.account,
            exchangeV: currentExchange.accountV,
            meta: metaPda,
            mintC: new PublicKey(accounts.factory.tokenC),
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            userC: walletTokenAccountC,
            userV: walletTokenAccountV
          }
        })
      const link = 'https://explorer.solana.com/tx/' + tx

      description = (<div>Your transaction signature is <a href={link} rel='noreferrer' target='_blank'><code>{tx}</code></a></div>)
      message = 'Order Successfully Place'

      getInverseData(currentExchange.symbol)
      getBalance(currentExchange.symbol)
      getPositions(currentExchange.symbol)

      setBondDeposit()
    } catch (err) {
      description = 'There was an error with your order'
      message = 'Order Error'
      console.log(err)
    }

    notification.open({description: description, duration: 0, message: message, placement: 'bottomLeft'})
  }

  async function approveStake() {
    let description
    let message

    try {
      const provider = await getProviderCallback()
      const factory = new Program(factoryIdl, new PublicKey(factoryIdl.metadata.address), provider)

      const tokenC = new Token(provider.connection, new PublicKey(accounts.factory.tokenC), TOKEN_PROGRAM_ID)
      const tokenS = new Token(provider.connection, new PublicKey(accounts.factory.tokenS), TOKEN_PROGRAM_ID)

      const mintInfoC = await tokenC.getMintInfo()

      const walletTokenAccountC = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenC.publicKey,
        provider.wallet.publicKey
      )
      const walletTokenAccountS = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenS.publicKey,
        provider.wallet.publicKey
      )

      // eslint-disable-next-line
      const [walletMetaPda, walletMetaBump] = await PublicKey.findProgramAddress(
        [toBuffer('meta'), provider.wallet.publicKey.toBuffer()],
        factory.programId
      )
      const factoryMetaDataAccountInfo = await factory.account.metaData.fetch(walletMetaPda)

      const [stakePda, stakeBump] = await PublicKey.findProgramAddress(
        [toBuffer('stake'), provider.wallet.publicKey.toBuffer(), toBuffer(factoryMetaDataAccountInfo.stakes.toNumber())],
        factory.programId
      )

      const tx = await factory.rpc.stake(
        new BN(stakeDeposit * (10 ** mintInfoC.decimals)),
        stakeBump, {
          accounts: {
            authority: provider.wallet.publicKey,
            clock: SYSVAR_CLOCK_PUBKEY,
            factoryC: new PublicKey(accounts.factory.accountC),
            meta: walletMetaPda,
            mintS: tokenS.publicKey,
            stake: stakePda,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            userC: walletTokenAccountC,
            userS: walletTokenAccountS,
          }
        }
      )
      const link = 'https://explorer.solana.com/tx/' + tx

      setStakeStep(0)
      setStakeDeposit()

      getCBalance()
      getStakes()
      getDashboardData()

      description = (<div>Your transaction signature is <a href={link} rel='noreferrer' target='_blank'><code>{tx}</code></a></div>)
      message = 'Stake Successfully Placed'
    } catch (err) {
      description = 'Transaction error'
      message = 'Stake Error'
      console.log(err)
    }

    notification.open({description: description, duration: 0, message: message, placement: 'bottomLeft'})
  }

  function onModalSelectExchange(exchange) {
    setIsInverseAssetModalVisible(false)
    setInverseAsset(exchange.symbol)
    getInverseData(exchange.symbol)
    getBalance(exchange.symbol)
    getPositions(exchange.symbol)
  }

  function calculateCountdown() {
    const today = new Date()
    const deadline = new Date()
    deadline.setHours(24, 0, 0, 0)
    const delta = deadline.getTime() - today.getTime()
    const hours = Math.floor((delta % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins = Math.floor((delta % (1000 * 60 * 60)) / (1000 * 60))
    const secs = Math.floor((delta % (1000 * 60)) / 1000)
    setCountdown(('0' + hours).slice(-2) + ':' + ('0' + mins).slice(-2) + ':' + ('0' + secs).slice(-2))
  }

  const settingsMenu = (
    <Menu>
      <Menu.Item key='github' onClick={() => window.open(githubUrl, '_blank')}>GitHub</Menu.Item>
      <Menu.Item key='discord'>Discord</Menu.Item>
    </Menu>
  )

  const assetTitleModal = (
    <Button className='AssetTitleModal' type='link' onClick={() => setIsInverseAssetModalVisible(true)}>{inverseAsset} <DownOutlined/></Button>
  )

  const inverseStatsBar = (
    <Row className='InverseStatsBar'>
      <Col span={3}></Col>
      <Col span={3}>
        <p><small>Market / Index</small></p>
        <Title level={5} className='Title Dark Green'>{marketPrice}<span className='White'> / {indexPrice}</span></Title>
      </Col>
      <Col span={3}>
        <p><small>24H Change (%)</small></p>
        <Title level={5} className='Title Dark Green'>{change24H}</Title>
      </Col>
      <Col span={3}>
        <p><small>24H High</small></p>
        <Title level={5} className='Title Dark'>{high24H}</Title>
      </Col>
      <Col span={3}>
        <p><small>24H Low</small></p>
        <Title level={5} className='Title Dark'>{low24H}</Title>
      </Col>
      <Col span={3}>
        <p><small>24H Turnaround ({inverseAsset})</small></p>
        <Title level={5} className='Title Dark'>{turnaround24H}</Title>
      </Col>
      <Col span={3}>
        <p><small>Funding (%) / Countdown</small></p>
        <Title level={5} className='Title Dark'><span className='Yellow'>{fundingRate}</span> / {countdown}</Title>
      </Col>
      <Col span={3}></Col>
    </Row>
  )

  const inverseQuantityDescription = (
    <small>Your order amount of <span className='White'>{inverseQuantity > 0 ? (inverseQuantity / 1).toFixed(2) : 0} USD</span> equals <span
        className='White'>{inverseQuantity > 0 ? (inverseQuantity / marketPrice).toFixed(2) : 0} {inverseAsset}</span></small>
  )

  const approveDescription = (<small>This transaction requires <span className='White'>{gasFee > 0 ? (gasFee / 1).toFixed(2) : 0} SOL</span></small>)

  const leverageDescription = (
    <small>At <span className='White'>{leverage}x</span> leverage your position is worth <span className='White'>
        {inverseQuantity > 0 ? (inverseQuantity / marketPrice * leverage).toFixed(2) : 0} {inverseAsset}</span></small>
  )

  const inverseView = (
    <>
      {inverseStatsBar}
      <br/>
      <Row>
        <Col span={6}></Col>
        { inverseCard === 'inverse' ?
        <>
          <Col span={8} className='Cards'>
            <div className='site-card-border-less-wrapper'>
              <Card title={assetTitleModal} className='Card Dark' bordered={false}
                extra={<a href='/#/inverse' className='CardLink' onClick={() => setInverseCard('positions')}>Positions</a>}>
                <p><strong>Quantity</strong></p>
                <Input className='InverseInput Input Dark' value={inverseQuantity} placeholder='0'
                  addonAfter={<Select defaultValue='USD' className='select-after'><Option value='USD'>USD</Option></Select>}
                  onChange={(e) => {setInverseQuantity(e.target.value); setInverseStep(1)}}/>
                <br/>
                <p>Your current exchange rate is 1 USD = {exchangeRate} {inverseAsset}</p>
                <Radio.Group onChange={(e) => setInverseDirection(e.target.value)} className='RadioGroup Dark' optionType='button' buttonStyle='solid'
                  value={inverseDirection}>
                  <Radio.Button className='BuyButton' value='long'>Buy / Long</Radio.Button>
                  <Radio.Button className='SellButton' value='short'>Sell / Short</Radio.Button>
                </Radio.Group>
                <br/>
                <br/>
                <p><strong>{leverage}x Leverage</strong></p>
                <Slider defaultValue={1} min={1} onAfterChange={(e) => {setLeverage(e); setInverseStep(2)}}/>
                <br/>
                <Button size='large' disabled={!wallet.connected} onClick={approveInverse} className='InverseButton Button Dark' type='ghost'>
                  Approve
                </Button>
              </Card>
            </div>
          </Col>
          <Col span={1}></Col>
          <Col span={3}>
            <Steps direction='vertical' current={inverseStep}>
              <Step key='set' title='Quantity' description={inverseQuantityDescription}/>
              <Step key='collateral' title='Leverage' description={leverageDescription}/>
              <Step key='order' title='Approve' description={approveDescription}/>
            </Steps>
          </Col>
        </> :
        <Col span={12} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card title={assetTitleModal} className='Card Dark' bordered={false}
              extra={<a href='/#/inverse' className='CardLink' onClick={() => setInverseCard('inverse')}>Inverse</a>}>
              <Table dataSource={inversePositions} columns={inversePositionsColumns} pagination={false}/>
            </Card>
          </div>
        </Col>
        }
        <Col span={6}></Col>
      </Row>
    </>
  )

  const bondView = (
    <>
      { bondCard === 'bond' ?
      <Row>
        <Col span={8}></Col>
        <Col span={8} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card className='Card Dark' title={assetTitleModal} bordered={false}
              extra={<a href='/#/bond' className='CardLink' onClick={(e) => setBondCard('positions')}>Positions</a>}>
              <Input className='StakeInput Input Dark' value={bondDeposit} placeholder='0' onChange={(e) => setBondDeposit(e.target.value)}/>
              <br/>
              <p>Your current rate is ${(marketPrice * 0.9).toFixed(2)} with a 5 day lockup period</p>
              <Button size='large' disabled={!wallet.connected} className='ApproveButton Button Dark' type='ghost' onClick={approveBond}>Approve</Button>
            </Card>
          </div>
        </Col>
        <Col span={8}></Col>
      </Row> :
      <Row>
        <Col span={6}></Col>
        <Col span={12} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card className='Card Dark' title={assetTitleModal} bordered={false}
              extra={<a href='/#/bond' className='CardLink' onClick={(e) => setBondCard('bond')}>Bond</a>}>
              <Table dataSource={bonds} columns={bondsColumns} pagination={false}/>
            </Card>
          </div>
        </Col>
        <Col span={6}></Col>
      </Row>
      }
    </>
  )

  const stakeDescription = (
    <small>Your deposit of <span className='White'>{stakeDeposit > 0 ? (stakeDeposit / 1).toFixed(2) : 0} {C_SYMBOL.toUpperCase()}</span>&nbsp;
      is set to earn <span className='White'>12% APY</span>
    </small>
  )

  const stakeView = (
    <Row>
      <Col span={6}></Col>
      { stakeCard === 'stake' ?
      <>
        <Col span={4}>
          <Steps direction='vertical' current={stakeStep}>
            <Step key='set' title='Quantity' description={stakeDescription}/>
            <Step key='deposit' title='Approve' description={approveDescription}/>
          </Steps>
        </Col>
        <Col span={1}></Col>
        <Col span={7} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card className='Card Dark' title=<Button className='AssetTitleModal' type='link'>{C_SYMBOL}</Button> bordered={false}
              extra={<a href='/#/stake' className='CardLink' onClick={() => setStakeCard('positions')}>Positions</a>}>
              <Input className='StakeInput Input Dark' value={stakeDeposit} placeholder='0'
                onChange={(e) => {setStakeStep(1); setStakeDeposit(e.target.value)}}/>
              <p>Your current balance is {cBalance} {C_SYMBOL}</p>
              <Button size='large' disabled={!wallet.connected} className='ApproveButton Button Dark' type='ghost' onClick={approveStake}>Approve</Button>
            </Card>
          </div>
        </Col>
      </> :
      <Col span={12} className='Cards'>
        <Card className='Card Dark' title=<Button className='AssetTitleModal' type='link'>{C_SYMBOL}</Button> bordered={false}
          extra={<a href='/#/stake' className='CardLink' onClick={() => setStakeCard('stake')}>Stake</a>}>
          <Table dataSource={stakePositions} columns={stakePositionsColumns} pagination={false}/>
        </Card>
      </Col>
      }
      <Col span={6}></Col>
    </Row>
  )

  const daoView = (
    <>
      { daoCard === 'statistics' ?
      <Row>
        <Col span={2}></Col>
        <Col span={20} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card className='Card Dark' title='DAO' bordered={false} extra={<a href='/#/dao' className='CardLink' onClick={() => setDAOCard('vote')}>
                Vote</a>}>
              <Row>
                <Col span={6}>
                  <p>Market Cap</p>
                  <Title level={3} className='Title Dark'>{cMarketCap}</Title>
                </Col>
                <Col span={6}>
                  <p>{C_SYMBOL} Price</p>
                  <Title level={3} className='Title Dark'>{cCurrentPrice}</Title>
                </Col>
                <Col span={6}>
                  <p>Circulating Supply (Total)</p>
                  <Title level={3} className='Title Dark'>{cCirculatingSupplyTotal}</Title>
                </Col>
                <Col span={6}>
                  <p>Markets</p>
                  <Title level={3} className='Title Dark'>{tokenCount}</Title>
                </Col>
              </Row>
              <br/>
              <Row>
                <Col span={12}>
                  <p>Total Value Deposited</p>
                  <Line height={100} data={tvdData} options={chartOptions}/>
                </Col>
                <Col span={12}>
                  <p>Market Value of Treasury Assets</p>
                  <Line height={100} data={treasuryData} options={chartOptions}/>
                </Col>
              </Row>
            </Card>
          </div>
        </Col>
        <Col span={2}></Col>
      </Row> :
      <Row>
        <Col span={2}></Col>
        <Col span={20} className='Cards'>
          <div className='site-card-border-less-wrapper'>
            <Card className='Card Dark' title='DAO' bordered={false}
              extra={<a href='/#/dao' className='CardLink' onClick={(e) => setDAOCard('statistics')}>Statistics</a>}>
              <List itemLayout='horizontal' dataSource={daoProposals} renderItem={item => (<List.Item><List.Item.Meta title={item.title}
                description={item.description}/>{item.icon}</List.Item>)}
              />
            </Card>
          </div>
        </Col>
        <Col span={2}></Col>
      </Row>
      }
    </>
  )

  useEffect(() => {
    setMenu(getWindowRoute())
  }, [setMenu])

  useEffect(() => {
    if (!isBlockHeightIntervalSet) {
      setIsBlockHeightIntervalSet(true)
      setInterval(getBlockHeightCallback, 10000)
    }
  }, [isBlockHeightIntervalSet, getBlockHeightCallback])

  useEffect(() => {
    if (!isCountdownIntervalSet) {
      setIsCountdownIntervalSet(true)
      setInterval(calculateCountdown, 1000)
    }
  }, [isCountdownIntervalSet, setIsCountdownIntervalSet])

  useEffect(() => {
    if (!isInverseDataSet) {
      setIsInverseDataSet(true)
      getDashboardDataCallback()
      getInverseDataCallback(DEFAULT_SYMBOL)
    }
  }, [getDashboardDataCallback, getInverseDataCallback, isInverseDataSet])

  useEffect(() => {
    if (wallet.connected && !isUserDataSet) {
      setIsUserDataSet(true)
      getBalanceCallback(inverseAsset ? inverseAsset : DEFAULT_SYMBOL)
      getPositionsCallback(inverseAsset ? inverseAsset : DEFAULT_SYMBOL)
      getStakesCallback()
      getCBalanceCallback()
    }
  }, [getBalanceCallback, getCBalanceCallback, getPositionsCallback, getStakesCallback, inverseAsset, isUserDataSet, wallet.connected])

  return (
    <Layout className='App Dark'>
      { !IS_LOCALNET ?
      <Alert type='info' className='Banner' message=<small>You are currently using an unaudited piece of software via {network}. Use at your own risk.
      </small>/> : null
      }
      <Header className='Header Dark'>
        <Row>
          <Col span={6}>
            <div className='Logo Dark'>
              <img onClick={() => window.open(githubUrl, '_blank')} src='/logo.png' alt='Logo' className='LogoImage'/>
            </div>
          </Col>
          <Col span={12} className='ColCentered'>
            <Menu className='Menu Dark' onClick={(e) => {setMenu(e.key); window.location.href = '/#/' + e.key}} selectedKeys={[menu]}
              mode='horizontal'>
              <Menu.Item key='dao'><BankOutlined/>&nbsp; DAO</Menu.Item>
              <Menu.Item key='inverse'><DollarOutlined/>&nbsp; Inverse Perpetuals</Menu.Item>
              <Menu.Item key='bond'><HistoryOutlined/>&nbsp; Bond</Menu.Item>
              <Menu.Item key='stake'><PieChartOutlined/>&nbsp; Stake</Menu.Item>
            </Menu>
          </Col>
          <Col span={6} className='ConnectWalletHeader'>
            { !wallet.connected ?
            <>
              <WalletMultiButton className='WalletMultiButton'/>
              <Button className='ConnectWalletButton' onClick={(e) => document.getElementsByClassName('WalletMultiButton')[0].click()} type='link'>
                Connect Wallet
              </Button>
            </> :
            <Button className='ConnectWalletButton' type='link'>
              <code className='SolCount'>{balance > 0 ? (balance / 1).toFixed(2) : 0 } {inverseAsset}</code>
              <code>{wallet.publicKey.toString().substr(0, 4)}...{wallet.publicKey.toString().substr(-4)}</code>
            </Button>
            }
            <Dropdown className='Dropdown SettingsDropdown' overlay={settingsMenu}><SettingOutlined/></Dropdown>
          </Col>
        </Row>
      </Header>
      <Layout className='Layout Dark'>
        <Content>
          <div>
            <br/>
            <br/>
            { menu === 'inverse' ? inverseView : null }
            { menu === 'stake' ? stakeView : null }
            { menu === 'bond' ? bondView : null }
            { menu === 'dao' ? daoView : null }
          </div>
        </Content>
      </Layout>
      <Footer className='Footer'><code className='BlockHeight'><small>• {blockHeight}</small></code>
      </Footer>
      <Modal title='Assets' footer={null} visible={isInverseAssetModalVisible} onCancel={() => {setIsInverseAssetModalVisible(false)}}>
        <List itemLayout='horizontal' dataSource={accounts.exchanges} forcerender='true' renderItem={exchange => (
          <List.Item className='Asset ListItem'>
            <List.Item.Meta title={exchange.symbol} onClick={() => onModalSelectExchange(exchange)}/>
        </List.Item>)}/>
      </Modal>
    </Layout>
  )
}

const AppWithProvider = () => (
  <ConnectionProvider endpoint={network}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <App/>
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

export default AppWithProvider
