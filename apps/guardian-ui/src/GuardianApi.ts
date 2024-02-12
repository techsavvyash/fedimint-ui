import { JsonRpcError, JsonRpcWebsocket } from 'jsonrpc-client-websocket';
import {
  AuditSummary,
  ClientConfig,
  ConfigGenParams,
  ConsensusState,
  FederationStatus,
  ModuleKind,
  ModulesConfigResponse,
  PeerHashMap,
  ServerStatus,
  StatusResponse,
  Versions,
} from '@fedimint/types';
import { getEnv } from './utils/env';
import { AdminRpc, ModuleRpc, SetupRpc, SharedRpc } from './types';

const SESSION_STORAGE_KEY = 'guardian-ui-key';

export class GuardianApi {
  private websocket: JsonRpcWebsocket | null = null;
  private connectPromise: Promise<JsonRpcWebsocket> | null = null;

  /*** WebSocket methods ***/

  public connect = async (): Promise<JsonRpcWebsocket> => {
    if (this.websocket !== null) {
      return this.websocket;
    }
    if (this.connectPromise) {
      return await this.connectPromise;
    }
    const websocketUrl = (await getEnv()).fm_config_api;
    if (!websocketUrl) {
      throw new Error('fm_config_api not found in config.json');
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const requestTimeoutMs = 1000 * 60 * 60 * 5; // 5 minutes, dkg can take a while
      const websocket = new JsonRpcWebsocket(
        websocketUrl,
        requestTimeoutMs,
        (error: JsonRpcError) => {
          console.error('failed to create websocket', error);
          reject(error);
          this.shutdown();
        }
      );
      websocket
        .open()
        .then(() => {
          this.websocket = websocket;
          resolve(this.websocket);
        })
        .catch((error) => {
          console.error('failed to open websocket', error);
          reject(
            new Error(
              'Failed to connect to API, confirm your server is online and try again.'
            )
          );
        });
    });

    return this.connectPromise;
  };

  private shutdown = async (): Promise<boolean> => {
    if (this.connectPromise) {
      this.connectPromise = null;
    }
    if (this.websocket) {
      const evt: CloseEvent = await this.websocket.close();
      this.websocket = null;
      return evt.type === 'close' && evt.wasClean;
    }

    return true;
  };

  public getPassword = (): string | null => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  };

  public testPassword = async (password: string): Promise<boolean> => {
    // Replace with password to check.
    sessionStorage.setItem(SESSION_STORAGE_KEY, password);

    // Attempt a 'status' rpc call with the temporary password.
    try {
      await this.auth();
      return true;
    } catch (err) {
      // TODO: make sure error is auth error, not unrelated
      this.clearPassword();
      return false;
    }
  };

  private clearPassword = () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  };

  /*** Shared RPC methods */

  /*** Shared RPC methods */
  auth = (): Promise<void> => {
    return this.call(SharedRpc.auth);
  };

  status = (): Promise<StatusResponse> => {
    return this.call(SharedRpc.status);
  };

  /*** Setup RPC methods ***/

  public setPassword = async (password: string): Promise<void> => {
    // Save password to session storage so that it's included in the r[c] call
    sessionStorage.setItem(SESSION_STORAGE_KEY, password);

    try {
      await this.call(SetupRpc.setPassword);
    } catch (err) {
      // If the call failed, clear the password first then re-throw
      this.clearPassword();
      throw err;
    }
  };

  public setConfigGenConnections = async (
    ourName: string,
    leaderUrl?: string
  ): Promise<void> => {
    const connections = {
      our_name: ourName,
      leader_api_url: leaderUrl,
    };

    return this.call(SetupRpc.setConfigGenConnections, connections);
  };

  public getDefaultConfigGenParams = (): Promise<ConfigGenParams> => {
    return this.call(SetupRpc.getDefaultConfigGenParams);
  };

  public getConsensusConfigGenParams = (): Promise<ConsensusState> => {
    return this.call(SetupRpc.getConsensusConfigGenParams);
  };

  public setConfigGenParams = (params: ConfigGenParams): Promise<void> => {
    return this.call(SetupRpc.setConfigGenParams, params);
  };

  public getVerifyConfigHash = (): Promise<PeerHashMap> => {
    return this.call(SharedRpc.getVerifyConfigHash);
  };

  public runDkg = (): Promise<void> => {
    return this.call(SetupRpc.runDkg);
  };

  public verifiedConfigs = (): Promise<void> => {
    return this.call(SetupRpc.verifiedConfigs);
  };

  public startConsensus = async (): Promise<void> => {
    const sleep = (time: number) =>
      new Promise((resolve) => setTimeout(resolve, time));

    // Special case: start_consensus kills the server, which sometimes causes it not to respond.
    // If it doesn't respond within 5 seconds, continue on with status checks.
    await Promise.any([this.call<null>(SetupRpc.startConsensus), sleep(5000)]);

    // Try to reconnect and confirm that status is ConsensusRunning. Retry multiple
    // times, but eventually give up and just throw.
    let tries = 0;
    const maxTries = 10;
    const attemptConfirmConsensusRunning = async (): Promise<void> => {
      try {
        await this.connect();
        await this.shutdown();
        const status = await this.status();
        if (status.server === ServerStatus.ConsensusRunning) {
          return;
        } else {
          throw new Error(
            `Expected status ConsensusRunning, got ${status.server}`
          );
        }
      } catch (err) {
        console.warn('Failed to confirm consensus running:', err);
      }
      // Retry after a delay if we haven't exceeded the max number of tries, otherwise give up.
      if (tries < maxTries) {
        tries++;
        await sleep(1000);
        return attemptConfirmConsensusRunning();
      } else {
        throw new Error('Failed to start consensus, see logs for more info.');
      }
    };

    return attemptConfirmConsensusRunning();
  };

  public restartSetup: () => Promise<void> = () => {
    return this.call(SetupRpc.restartSetup);
  };

  /*** Running RPC methods */

  public version = (): Promise<Versions> => {
    return this.call(AdminRpc.version);
  };

  public fetchBlockCount = (config: ClientConfig): Promise<number> => {
    const walletModuleId = config
      ? Object.entries(config.modules).find(
          (m) => m[1].kind === ModuleKind.Wallet
        )?.[0]
      : undefined;

    if (!walletModuleId) {
      throw new Error('No wallet module found');
    }
    return this.moduleApiCall(Number(walletModuleId), ModuleRpc.blockCount);
  };

  public federationStatus = (): Promise<FederationStatus> => {
    return this.call(AdminRpc.federationStatus);
  };

  public inviteCode = (): Promise<string> => {
    return this.call(AdminRpc.inviteCode);
  };

  public config = (): Promise<ClientConfig> => {
    return this.call(AdminRpc.config);
  };

  public audit = (): Promise<AuditSummary> => {
    return this.call(AdminRpc.audit);
  };

  public modulesConfig = (): Promise<ModulesConfigResponse> => {
    return this.call(AdminRpc.modulesConfig);
  };

  public moduleApiCall = <T>(moduleId: number, rpc: ModuleRpc): Promise<T> => {
    const method = `${AdminRpc.moduleApiCall}_${moduleId}_${rpc}`;
    return this.call_any_method<T>(method);
  };

  private call = async <T>(
    method: SetupRpc | AdminRpc | SharedRpc,
    params: unknown = null
  ): Promise<T> => {
    return this.call_any_method(method, params);
  };

  private call_any_method = async <T>(
    method: string,
    params: unknown = null
  ): Promise<T> => {
    try {
      const websocket = await this.connect();

      const response = await websocket.call(method, [
        {
          auth: this.getPassword() || null,
          params,
        },
      ]);

      if (response.error) {
        throw response.error;
      }

      const result = response.result as T;
      console.log(`${method} rpc result:`, result);

      return result;
    } catch (error: unknown) {
      console.error(`error calling '${method}' on websocket rpc : `, error);
      throw 'error' in (error as { error: JsonRpcError })
        ? (error as { error: JsonRpcError }).error
        : error;
    }
  };
}

export type SetupApiInterface = Pick<
  GuardianApi,
  keyof typeof SetupRpc | keyof typeof SharedRpc
>;
export type AdminApiInterface = Pick<
  GuardianApi,
  keyof typeof AdminRpc | keyof typeof SharedRpc
>;
