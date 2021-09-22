import 'antd/dist/antd.css';
import './App.css';

import { Button, Card, Col, Input, Layout, Menu, Row, Select, Typography } from 'antd';
import { Program, Provider, web3 } from '@project-serum/anchor';
import { useState } from 'react';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getPhantomWallet } from '@solana/wallet-adapter-wallets';
import { Connection, PublicKey } from '@solana/web3.js';

import idl from './idl.json';

const { Header, Footer, Content } = Layout;
const { Option } = Select;
const { Title } = Typography;
const { SystemProgram, Keypair } = web3;

const wallets = [getPhantomWallet()]
const baseAccount = Keypair.generate();
const opts = { preflightCommitment: "processed" };
const programID = new PublicKey(idl.metadata.address);

function App() {
  const [menu, setMenu] = useState('swap');
  const wallet = useWallet()

  async function getProvider() {
    // Create the provider and return it to the caller network set to local network for now
    const network = "http://127.0.0.1:8899";
    const connection = new Connection(network, opts.preflightCommitment);
    const provider = new Provider(connection, wallet, opts.preflightCommitment);
    console.log('provider', provider);
    return provider;
  }

  async function initialize() {
    const provider = await getProvider();
    // Create the program interface combining the idl, program ID, and provider
    const program = new Program(idl, programID, provider);
    try {
      // Interact with the program via rpc
      await program.rpc.initialize("Hello World", {
        accounts: {
          baseAccount: baseAccount.publicKey,
          user: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [baseAccount]
      });

      const account = await program.account.baseAccount.fetch(baseAccount.publicKey);
      console.log('account: ', account);
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  const selectBefore = (
    <Select defaultValue="SOL" className="select-before">
      <Option value="SOL">SOL</Option>
      <Option value="BTC">BTC</Option>
    </Select>
  );

  async function handleMenuClick(e) {
    setMenu(e.key);
  };

  async function onConnectWalletClick(e) {
    document.getElementsByClassName('WalletMultiButton')[0].click();
  };

  async function onLearnMoreClick(e) {
    window.open("https://www.github.com/xv01-finance", "_blank");
  };

  return (
    <Layout className="App">
      <Header className="Header">
        <Row>
          <Col span={3}>
            <div className="logo"><strong>xv01.finance</strong></div>
          </Col>
          <Col span={13}>
            <Menu className="Menu" onClick={handleMenuClick} selectedKeys={[menu]} mode="horizontal">
              <Menu.Item key="swap">Swap</Menu.Item>
              <Menu.Item key="pool">Pool</Menu.Item>
              <Menu.Item key="charts">Charts</Menu.Item>
            </Menu>
          </Col>
          <Col span={8} className="ConnectWalletHeader">
            { !wallet.connected ? (
              <>
                <WalletMultiButton className="WalletMultiButton" />
                <Button onClick={onConnectWalletClick} type="link">Connect Wallet</Button>
              </>) :
              <div className="Connected">
                <code>
                  { wallet.publicKey.toString().substr(0, 4) }...{ wallet.publicKey.toString().substr(-4) }
                </code>
              </div>
            }
          </Col>
        </Row>
      </Header>
      <Content>
        <div>
          <br/>
          <br/>
          { !wallet.connected ? (
            <>
              <Title>Perpetual futures and yield-based XV01 pooling protocol</Title>
              <Row>
                <Col span={12}>
                  <Button className="ConnectWallet" onClick={onConnectWalletClick} type="primary" size="large">Connect Wallet</Button>
                </Col>
                <Col span={12}>
                  <Button className="LearnMore" onClick={onLearnMoreClick} ghost size="large">Learn More</Button>
                </Col>
              </Row>
            </>
          ) : <Title level={2}>Balance: 0 SOL</Title> }
          <br/>
          <br/>
          { menu === "swap" ? (
            <Row>
              <Col span={8}></Col>
              <Col span={8} className="Cards">
                <div className="site-card-border-less-wrapper">
                  <Card title="Swap" bordered={false}>
                    <Input className="SwapInput" addonBefore={selectBefore} defaultValue="0" />
                    <br/>
                    <p>Your current balance is <strong>0</strong></p>
                    <Input className="SwapInput" addonBefore={selectBefore} defaultValue="0" />
                    <br/>
                    <br/>
                    <Button size="large" disabled={!wallet.connected} className="SwapButton" type="ghost">Swap</Button>
                  </Card>
                </div>
              </Col>
              <Col span={8}></Col>
            </Row>
          ) : "" }
          { menu === "pool" ? (
            <Row>
              <Col span={8}></Col>
              <Col span={8} className="Cards">
                <div className="site-card-border-less-wrapper">
                  <Card title="Pool" bordered={false}>
                    <Input className="PoolInput" addonBefore={selectBefore} defaultValue="0" />
                    <br/>
                    <p>Your current balance is <strong>0</strong></p>
                    <Button size="large" disabled={!wallet.connected} className="DepositButton" type="ghost">Deposit</Button>
                  </Card>
                </div>
              </Col>
              <Col span={8}></Col>
            </Row>
          ) : "" }
          { menu === "charts" ? (
            <Row>
              <Col span={2}></Col>
              <Col span={20} className="Cards">
                <div className="site-card-border-less-wrapper">
                  <Card title="Charts" bordered={false}>
                    <p>Coming soon!</p>
                  </Card>
                </div>
              </Col>
              <Col span={2}></Col>
            </Row>
          ) : "" }
        </div>
      </Content>
      <Footer><code className="CurrentBlock"><small>• 97,826,670</small></code></Footer>
    </Layout>
  );
}

const AppWithProvider = () => (
  <ConnectionProvider endpoint="http://127.0.0.1:8899">
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <App />
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

export default AppWithProvider;
