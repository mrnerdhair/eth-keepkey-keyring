import { EventEmitter } from "events";
import * as ethUtil from "ethereumjs-util";
import type { Transaction as EthJsTransaction } from "@ethereumjs/tx";
import * as core from "@shapeshiftoss/hdwallet-core";
import * as keepkeyWebUsb from "@shapeshiftoss/hdwallet-keepkey-webusb";

export default class KeepKeyKeyring extends EventEmitter {
  static readonly type = "KeepKey Hardware";
  readonly type = KeepKeyKeyring.type;

  protected keyring: core.Keyring = new core.Keyring();
  protected wallet: core.ETHWallet | null = null;
  protected addressNList: core.BIP32Path =
    core.bip32ToAddressNList("m/44'/60'/0'/0/0");
  protected accounts: Array<string> = [];
  protected accountIndex = 0;

  // eslint-disable-next-line @typescript-eslint/ban-types
  constructor(obj?: object) {
    super();
    if (obj) this.deserialize(obj);
  }

  async serialize(): Promise<unknown> {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  async deserialize(_obj: object): Promise<void> {
    // Nothing to do
  }

  isUnlocked(): boolean {
    return this.wallet !== null;
  }

  async unlock(): Promise<string> {
    if (this.isUnlocked()) return "already unlocked";

    const adapter = keepkeyWebUsb.Adapter.useKeyring(this.keyring);
    const wallet = await adapter.pairDevice();
    if (!core.supportsETH(wallet))
      throw new Error("wallet instance does not support ETH");
    this.wallet = wallet;

    return this.addAccount();
  }

  addressNListForAccountIndex(n: number): core.BIP32Path {
    return core.bip32ToAddressNList(`m/44'/60'/${n}'/0/0`);
  }

  async addAccount(): Promise<string> {
    if (this.wallet === null) throw new Error("not unlocked");

    const n = this.accounts.length;
    const address = await this.wallet.ethGetAddress({
      addressNList: this.addressNListForAccountIndex(n),
    });
    if (address === null) throw new Error("unable to add account");
    this.accounts.push(address);
    return address;
  }

  async addAccounts(n = 1): Promise<string[]> {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(await this.addAccount());
    }
    return out;
  }

  async getAccounts(): Promise<string[]> {
    return this.accounts.slice();
  }

  private static _normalize(x: Buffer | ethUtil.BN): string {
    if (ethUtil.BN.isBN(x)) {
      return ethUtil.bnToHex(x);
    } else if (Buffer.isBuffer(x)) {
      return ethUtil.bufferToHex(x).toString();
    } else {
      throw new TypeError();
    }
  }

  async signTransaction(
    withAccount: string,
    tx: EthJsTransaction
  ): Promise<ethUtil.ECDSASignatureBuffer> {
    if (this.wallet === null) throw new Error("not unlocked");
    const accountIndex = this.accounts.indexOf(withAccount);
    if (accountIndex < 0) throw new Error("no account with provided address");
    const addressNList = this.addressNListForAccountIndex(accountIndex);

    if (!tx.to) throw new Error("to address expected");
    const signed = await this.wallet.ethSignTx({
      addressNList,
      chainId: tx.common.chainIdBN().toNumber(),
      nonce: KeepKeyKeyring._normalize(tx.nonce),
      to: tx.to.toString(),
      value: KeepKeyKeyring._normalize(tx.value),
      data: KeepKeyKeyring._normalize(tx.data),
      gasLimit: KeepKeyKeyring._normalize(tx.gasLimit),
      gasPrice: KeepKeyKeyring._normalize(tx.gasPrice),
    });
    if (!signed) throw new Error("signing failed");

    return {
      v: Buffer.from([signed.v]),
      r: ethUtil.toBuffer(signed.r),
      s: ethUtil.toBuffer(signed.s),
    };
  }

  async signMessage(withAccount: string, data: string): Promise<string> {
    return this.signPersonalMessage(withAccount, data);
  }

  async signPersonalMessage(
    withAccount: string,
    msgHex: string
  ): Promise<string> {
    const accountIndex = this.accounts.indexOf(withAccount);
    if (this.wallet === null) throw new Error("not unlocked");
    if (accountIndex < 0) throw new Error("no account with provided address");
    const addressNList = this.addressNListForAccountIndex(accountIndex);

    const signed = await this.wallet.ethSignMessage({
      addressNList,
      message: ethUtil.toBuffer(msgHex).toString("utf8"),
    });
    if (!signed) throw new Error("unable to sign message");

    return signed.signature;
  }

  async decryptMessage(
    _withAccount: string,
    _encryptedData: unknown
  ): Promise<never> {
    throw new Error("Not supported on this device");
  }

  async signTypedData(
    _withAccount: string,
    _typedData: unknown,
    _opts?: { version: "V4" }
  ): Promise<never> {
    throw new Error("Not supported on this device");
  }

  async getEncryptionPublicKey(_withAccount: string): Promise<never> {
    throw new Error("Not supported on this device");
  }

  async getAppKeyAddress(_withAccount: string, _origin: string): Promise<never> {
    throw new Error("Not supported on this device");
  }

  async exportAccount(_withAccount: string): Promise<never> {
    throw new Error("Not supported on this device");
  }

  removeAccount(_withAccount: string): Promise<never> {
    throw new Error("Not supported on this device");
  }

  forgetDevice(): Promise<never> {
    throw new Error("Not supported on this device");
  }
}
