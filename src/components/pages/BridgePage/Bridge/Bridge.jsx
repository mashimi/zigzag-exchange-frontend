import React, { useEffect, useState, useMemo } from "react";
import {
  constants as ethersConstants,
  utils as ethersUtils
} from 'ethers';
import { useSelector } from "react-redux";
import isEmpty from "lodash/isEmpty";
import { SwapButton, useCoinEstimator, QuestionHelper } from "components";
import {
  networkSelector,
  balancesSelector,
} from "lib/store/features/api/apiSlice";
import { userSelector } from "lib/store/features/auth/authSlice";
import { Box } from "@material-ui/core";
import { toast } from "react-toastify";
import styled from "styled-components";

import api from "lib/api";
import { MAX_ALLOWANCE } from "lib/api/constants";
import { formatUSD, formatPrice } from "lib/utils";
import {
  NETWORKS,
  ZKSYNC_ETHEREUM_FAST_BRIDGE,
  ZKSYNC_POLYGON_BRIDGE
} from "./constants"
import RadioButtons from "components/atoms/RadioButtons/RadioButtons";
import { Button, ConnectWalletButton } from "components/molecules/Button";
import BridgeSwapInput from "../BridgeSwapInput/BridgeSwapInput";
import L2Header from "./L2Header";
import L1Header from "./L1Header";
import { BridgeInputBox } from '../BridgeSwapInput/BridgeSwapInput';
import { LoadingSpinner } from "components/atoms/LoadingSpinner";
import { ExternalLinkIcon } from "components/atoms/Svg";
import Text from "components/atoms/Text/Text";

const defaultTransfer = {
  type: "deposit",
};

export const BridgeBox = styled.div`
  padding: 2rem;
  border: 1px solid ${({ theme }) => theme.colors.foreground400};
  border-radius: 1rem;

  .layer {
    display: flex;
    justify-content: space-between;
    margin-top: 13px;

    &:not(:last-child) {
      margin-bottom: 15px;
    }

    &.layer-end {
      justify-content: flex-end;
      align-items: center;
      
      p {
        color: ${(p) => p.theme.colors.foregroundHighEmphasis};
        opacity: 0.72;
      }
    }
  }

  .spinner {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .bridge_coin_details {
    .svg {
      color: ${(p) => p.theme.colors.foregroundHighEmphasis};
    }
  }

  .bridge_coin_image {
    width: 26px;
    height: 26px;
    text-align: center;
    overflow: hidden;
    border-radius: 50%;
  }

  .bridge_coin_name {
    font-size: 16px;
    font-weight: 600;
    color: ${(p) => p.theme.colors.foregroundHighEmphasis};

    span {
      font-size: 12px;
    }
  }

  .font-thin {
    font-weight: 400;
  }

  .maxLink {
    font-size: 10px;
  }
  
  .bridge_bubble_connected, .bridge_bubble_disconnected {
    border: 1px solid ${(p) => p.theme.colors.foregroundHighEmphasis}
  }

  h3 {
    color: ${(p) => p.theme.colors.foregroundHighEmphasis};
    font-size: 14px;
    font-weight: 600;
  }

  h4 {
    color: ${(p) => p.theme.colors.foregroundHighEmphasis};
    font-size: 12px;
  }

  p {
    font-size: 10px;
    font-weight: 400;
    color: ${(p) => p.theme.colors.foregroundHighEmphasis}
  }

  span {
    color: ${(p) => p.theme.colors.foregroundHighEmphasis}
  }
`;

const CustomSwapButton = styled(SwapButton)`
  position: absolute;
  left: 50%;
  width: 34px;
  height: 34px;
  transform: translateX(-50%);
`

const ActionWrapper = styled(Text)`
    text-decoration: underline;
    cursor: pointer;
`

const Bridge = (props) => {
  const user = useSelector(userSelector);
  const balanceData = useSelector(balancesSelector);
  const [loading, setLoading] = useState(false);
  const [isApproving, setApproving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [L2Fee, setL2Fee] = useState(null);
  const [L2FeeToken, setL2FeeToken] = useState(null);
  const [L1Fee, setL1Fee] = useState(null);
  const network = useSelector(networkSelector);
  const [transfer, setTransfer] = useState(defaultTransfer);
  const [swapCurrencyInfo, setSwapCurrencyInfo] = useState({ decimals: 0 });
  const [allowance, setAllowance] = useState(ethersConstants.Zero);
  const [hasAllowance, setHasAllowance] = useState(false);
  const [fromNetwork, setFromNetwork] = useState(NETWORKS[0])
  const [toNetwork, setToNetwork] = useState(fromNetwork.to[0])
  const [balances, setBalances] = useState([]);
  const [altBalances, setAltBalances] = useState([]);
  const [polygonLoding, setPolygonLoading] = useState(false)
  const [swapDetails, _setSwapDetails] = useState(() => ({
    amount: "",
    currency: "ETH",
  }));
  const [hasError, setHasError] = useState(false);
  const [activationFee, setActivationFee] = useState(0);
  const [usdFee, setUsdFee] = useState(0);
  const [switchClicking, setSwitchClicking] = useState(false);
  const [gasFetching, setGasFetching] = useState(false);

  const coinEstimator = useCoinEstimator();
  const currencyValue = coinEstimator(swapDetails.currency);

  const estimatedValue =
    +swapDetails.amount * coinEstimator(swapDetails.currency) || 0;
  const [fastWithdrawCurrencyMaxes, setFastWithdrawCurrencyMaxes] = useState(
    {}
  );

  const walletBalances = useMemo(() => (balanceData.wallet) ? balanceData.wallet : {}, [balanceData.wallet])
  const zkBalances = useMemo(() => (balanceData[network]) ? balanceData[network] : {}, [balanceData, network])
  const polygonBalances = useMemo(() => (balanceData.polygon) ? balanceData.polygon : {}, [balanceData.polygon])

  const _getBalances = (_network) => {
    let balances = [];
    if (_network === "polygon") {
      balances = polygonBalances;
    } else if (_network === "ethereum") {
      balances = walletBalances;
    } else if (_network === "zksync") {
      balances = zkBalances;
    } else {
      setFormErr("Bad Network");
    }
    return balances;

  }

  useEffect(async () => {
    if (!user.address) return;
    setBalances(_getBalances(fromNetwork.from.key));
    setAltBalances(_getBalances(toNetwork.key));
  }, [toNetwork, user.address, walletBalances, zkBalances, polygonBalances])

  const [withdrawSpeed, setWithdrawSpeed] = useState("fast");
  const isFastWithdraw = () => {
    return (withdrawSpeed === "fast" &&
      transfer.type === "withdraw" &&
      api.apiProvider.eligibleFastWithdrawTokens.includes(swapDetails.currency));
  }

  useEffect(() => {
    setHasError(formErr && formErr.length > 0);
  }, [formErr])

  const isSwapAmountEmpty = swapDetails.amount === "";

  useEffect(() => {
    setHasAllowance(
      balances[swapDetails.currency] &&
      balances[swapDetails.currency].allowance.gte(MAX_ALLOWANCE.div(3))
    );
  }, [toNetwork, swapDetails])

  useEffect(() => {
    if (fromNetwork.from.key === 'zksync') {
      const type = transfer.type = "withdraw";
      setTransfer({ type });
    }
    else {
      api.getWalletBalances()
      const type = transfer.type = "deposit";
      setTransfer({ type });
    }

    if (fromNetwork.from.key === 'polygon') {
      api.getPolygonWethBalance()
      setSwapDetails({ amount: '', currency: 'WETH' })
    }
    else if (fromNetwork.from.key === 'ethereum') {
      api.getWalletBalances()
      const currency = switchClicking ? swapDetails.currency : 'ETH';
      setSwapDetails({ amount: '', currency });

    }
    else if (fromNetwork.from.key === 'zksync' && toNetwork.key === 'ethereum') {
      const currency = switchClicking ? swapDetails.currency : 'ETH';
      setSwapDetails({ amount: '', currency });
    }
    else if (fromNetwork.from.key === 'zksync' && toNetwork.key === 'polygon') {
      setSwapDetails({ amount: '', currency: 'ETH' });
    }
    setSwitchClicking(false);
  }, [toNetwork])

  useEffect(() => {
    let _swapCurrencyInfo = {}
    if (swapDetails.currency === 'WETH') {
      _swapCurrencyInfo = api.getCurrencyInfo('ETH');
    }
    else {
      _swapCurrencyInfo = api.getCurrencyInfo(swapDetails.currency);
    }

    setSwapCurrencyInfo(_swapCurrencyInfo)

    if (swapDetails.currency === "ETH") {
      setAllowance(MAX_ALLOWANCE);
      setHasAllowance(true);
      return;
    }
    if (isEmpty(balances) || !swapDetails.currency) {
      return;
    }


    const swapAmountBN = ethersUtils.parseUnits(
      isSwapAmountEmpty ? '0.0' : swapDetails.amount,
      _swapCurrencyInfo?.decimals
    );
    const allowanceBN = balances[swapDetails.currency]?.allowance ?? ethersConstants.Zero;
    setAllowance(allowanceBN);
    setHasAllowance(allowanceBN.gte(swapAmountBN));
  }, [balances, swapDetails, isSwapAmountEmpty]);

  useEffect(() => {
    if (user.address) {
      api.getL2FastWithdrawLiquidity().then((maxes) => {
        setFastWithdrawCurrencyMaxes(maxes);
      });
      calculateFees();
    }
  }, [user.address]);

  useEffect(() => {
    calculateFees();
    if (withdrawSpeed === "normal") {
      setL1Fee(null);
    }
  }, [withdrawSpeed]);

  useEffect(async () => {
    if (
      !api.apiProvider.eligibleFastWithdrawTokens?.includes(swapDetails.currency)
    ) {
      setWithdrawSpeed("normal");
    } else {
      setWithdrawSpeed("fast");
    }

    // update changePubKeyFee fee if needed
    if (
      user.address &&
      api.apiProvider?.zksyncCompatible
    ) {
      const usdFee = await api.apiProvider.changePubKeyFee();
      setUsdFee(usdFee);
      setActivationFee((usdFee / currencyValue).toFixed(5));
    }
  }, [swapDetails.currency, user.address]);

  useEffect(() => {
    calculateFees();
  }, [swapDetails.amount, swapDetails.currency]);

  const validateInput = (inputValue, swapCurrency) => {
    if (balances.length === 0) return false;
    const getCurrencyBalance = (cur) => (balances[cur] && swapCurrencyInfo?.decimals ? balances[cur].value / (10 ** (swapCurrencyInfo.decimals)) : 0);
    const detailBalance = getCurrencyBalance(swapCurrency);

    let error = null;
    if (inputValue > 0) {
      if (!user.id && inputValue <= activationFee) {
        error = `Must be more than ${activationFee} ${swapCurrency}`
      } else if (L2Fee !== null && inputValue < L2Fee) {
        error = "Amount too small";
      } else if (inputValue >= detailBalance) {
        error = "Insufficient balance";
      } else if (isFastWithdraw()) {
        if (toNetwork.key !== 'polygon' && L1Fee !== null && inputValue < L1Fee) {
          error = "Amount too small";
        }

        if (swapDetails.currency in fastWithdrawCurrencyMaxes) {
          const maxAmount = fastWithdrawCurrencyMaxes[swapCurrency];
          if (inputValue > maxAmount) {
            error = `Max ${swapCurrency} liquidity for fast withdraw: ${maxAmount.toPrecision(
              4
            )}`;
          } else if (toNetwork.key !== 'polygon' && L1Fee !== null && L2Fee !== null && inputValue < (L2Fee + L1Fee)) {
            error = "Amount too small";
          }
        }
      } else if (L2FeeToken !== null && L2FeeToken === swapCurrency) {
        if (L2Fee !== null && (inputValue + L2Fee) > detailBalance) {
          error = "Insufficient balance for fees";
        }
      } else if (L2FeeToken !== null) {
        const feeCurrencyBalance = getCurrencyBalance(L2FeeToken);
        if (L1Fee != null && feeCurrencyBalance < L1Fee) {
          error = "Insufficient balance for fees";
        }
      }
      /*else if (L1Fee !== null  && inputValue < L1Fee) {
        error = "Amount too small";
      }*/
      else if (inputValue < 0.0001 && (fromNetwork.from.key === 'polygon' || toNetwork.key === 'polygon')) {
        error = "Insufficient amount";
      }
    }

    if (error) {
      setFormErr(error);
      return false;
    }
    return true;
  };

  const validateFees = (inputValue, bridgeFee, feeCurrency) => {
    const feeCurrencyInfo = api.getCurrencyInfo(feeCurrency);
    if (balances.length === 0) return false;
    const feeTokenBalance = parseFloat(balances[feeCurrency] && balances[feeCurrency].value / (10 ** feeCurrencyInfo.decimals))

    if (
      inputValue > 0 &&
      bridgeFee > feeTokenBalance
    ) {
      setFormErr("Not enough balance to pay for fees")
      return false;
    }
    return true;
  };

  const setFastWithdrawFees = async (details) => {
    try {
      let res = await api.withdrawL2FastGasFee(details.currency);
      setFee(details, res.amount, res.feeToken);
    } catch (e) {
      console.error(e);
      setL2FeeToken(null);
      setFee(details, null, null);
    }

    if (toNetwork.key !== 'polygon') {
      try {
        let res = await api.withdrawL2FastBridgeFee(details.currency);
        setL1Fee(res);
      } catch (e) {
        console.error(e);
        setL1Fee(null);
      }
    }
    else {
      setL1Fee(null);
    }
  };

  const setNormalWithdrawFees = async (details) => {
    try {
      let res = await api.withdrawL2GasFee(details.currency);
      setFee(details, res.amount, res.feeToken);
    } catch (err) {
      console.log(err);
      setL2FeeToken(null);
      setFee(details, null, null);
    }
  };

  const setFee = (details, bridgeFee, feeToken) => {
    setL2Fee(bridgeFee)
    setL2FeeToken(feeToken)
    const input = parseFloat(details.amount) || 0
    const isInputValid = validateInput(input, details.currency)
    const isFeesValid = validateFees(input, bridgeFee, feeToken)
    if (isFeesValid && isInputValid) {
      setFormErr("");
    }
  };

  const setSwapDetails = async (values) => {
    const details = {
      ...swapDetails,
      ...values,
    };

    _setSwapDetails(details);
  }

  const calculateFees = async () => {
    const input = parseFloat(swapDetails.amount) || 0
    if ((input > 0 && input < 0.0001) && (fromNetwork.from.key === 'polygon' || toNetwork.key === 'polygon')) {
      setFormErr("Insufficient amount");
      return;
    }
    else if (swapDetails.amount.includes('0.000') && input === 0) {
      setFormErr("");
      return;
    }

    setL1Fee(null);

    setGasFetching(true);

    if (fromNetwork.from.key === 'polygon') {
      const gasFee = await api.getPolygonFee();
      if (gasFee) {
        setL1Fee(35000 * gasFee.fast.maxFee / 10 ** 9);
        setFee(swapDetails, 0, null)
      }
    }
    else if (transfer.type === "withdraw") {
      if (api.apiProvider.syncWallet) {
        if (isFastWithdraw()) {
          await setFastWithdrawFees(swapDetails);
        } else {
          await setNormalWithdrawFees(swapDetails);
        }
      }
    } else {
      const gasFee = await api.depositL2Fee(swapDetails.currency);
      if (gasFee) {
        let maxFee = (gasFee.maxFeePerGas) / 10 ** 9;
        //For deposit, ethereum gaslimit is 90000. not sure why it's not 21000. 
        // To get the close gasfee, I used 46000 for gas limit.
        setL1Fee(46000 * maxFee / 10 ** 9);
        setFee(swapDetails, null, null)
      }
    }

    setGasFetching(false);
  }

  const switchTransferType = (e) => {
    const f = NETWORKS.find(i => i.from.key === toNetwork.key)
    setFromNetwork(f)
    setToNetwork(fromNetwork.from)
    setSwitchClicking(true);
  };

  const approveSpend = (e) => {
    if (e) e.preventDefault();
    setApproving(true);
    api
      .approveSpendOfCurrency(swapDetails.currency)
      .then(() => {
        setApproving(false);
      })
      .catch((err) => {
        console.log(err);
        setApproving(false);
      });
  };

  const renderGuidContent = () => {
    return <div>
      <p style={{ fontSize: '14px', lineHeight: '24px' }}>1. Switch to Polygon network</p>
      <p style={{ fontSize: '14px', lineHeight: '24px' }}>2. Sign the transaction and wait for confirmation</p>
      <p style={{ fontSize: '14px', lineHeight: '24px' }}>3. Wait until "Switch Network" pops up</p>
      <p style={{ fontSize: '14px', lineHeight: '24px' }}>4. Switch back to Ethereum mainnet. Activating a new zkSync wallet costs ~$5. Enjoy trading on ZigZag!</p>
    </div>
  }

  const doTransfer = (e) => {
    e.preventDefault();
    let deferredXfer;
    setLoading(true);
    if (fromNetwork.from.key === "polygon" && toNetwork.key === "zksync") {
      setPolygonLoading(true);
      props.setLoading(true)
      deferredXfer = api.transferPolygonWeth(`${swapDetails.amount}`, user.address)
      toast.info(
        renderGuidContent(),
        {
          closeOnClick: false,
          autoClose: 15000,
        },
      );
    } else if (fromNetwork.from.key === "zksync" && toNetwork.key === "polygon") {
      deferredXfer = api.transferToBridge(
        `${swapDetails.amount}`,
        swapDetails.currency,
        ZKSYNC_POLYGON_BRIDGE.address,
        user.address
      );
    } else if (fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync") {
      deferredXfer = api.depositL2(
        `${swapDetails.amount}`,
        swapDetails.currency,
        user.address
      );
    } else if (fromNetwork.from.key === "zksync" && toNetwork.key === "ethereum") {
      if (isFastWithdraw()) {
        deferredXfer = api.transferToBridge(
          `${swapDetails.amount}`,
          swapDetails.currency,
          ZKSYNC_ETHEREUM_FAST_BRIDGE.address,
          user.address
        );
      } else {
        deferredXfer = api.withdrawL2(
          `${swapDetails.amount}`,
          swapDetails.currency
        );
      }
    } else {
      setFormErr("Wrong from/to combination")
      return false;
    }


    deferredXfer
      .then(() => {
        setTimeout(() => api.getAccountState(), 1000);
      })
      .catch((e) => {
        console.error("error sending transaction::", e);
        setTimeout(() => api.getAccountState(), 1000);
      })
      .finally(() => {
        setPolygonLoading(false)
        props.setLoading(false)
        setLoading(false);
        setSwapDetails({ amount: '' });
      });
  };

  const onSelectFromNetwork = ({ key }) => {
    const f = NETWORKS.find((i) => i.from.key === key)
    setFromNetwork(f)
    setToNetwork(f.to[0])
  };

  const onSelectToNetwork = ({ key }) => {
    const t = fromNetwork.to.find((i) => i.key === key)
    setToNetwork(t)
  }

  const getToBalance = () => {
    let balance, unit;
    if (fromNetwork.from.key === "polygon") {
      balance = altBalances["ETH"] ? altBalances["ETH"].valueReadable : '0.00'
      unit = "ETH";
    }
    else if (toNetwork.key === "polygon") {
      balance = altBalances["WETH"] ? altBalances["WETH"].valueReadable : '0.00'
      unit = "WETH";
    }
    else {
      balance = altBalances[swapDetails.currency] ? altBalances[swapDetails.currency].valueReadable : '0.00'
      unit = swapDetails.currency;
    }

    return balance + " " + unit;
  }

  const renderLabel = () => {
    return <>
      <Text font="primaryExtraSmall" color="foregroundHighEmphasis" mb={2}>
        Fast: receive ETH, UST and FRAX within seconds through ZigZag's Fast Withdrawal bridge.
      </Text>
      <Text font="primaryExtraSmall" color="foregroundHighEmphasis" mb={2}>
        Normal: use zkSync's bridge and receive funds after a few hours.
      </Text>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <ActionWrapper
          font="primaryExtraSmallSemiBold"
          color="primaryHighEmphasis"
          onClick={() => window.open("https://docs.zigzag.exchange/zksync/fast-withdraw-bridge", '_blank')}
        >
          Learn more
        </ActionWrapper>
        <ExternalLinkIcon size={10} />
      </div>
    </>
  }

  return (
    <>
      <BridgeBox className="mb-3">
        <Box className="layer">
          <Box component="h3">
            Transfer from
          </Box>

          <Box component="h3">
            Transfer to
          </Box>
        </Box>

        <Box className="layer">
          <L1Header networks={NETWORKS} onSelect={onSelectFromNetwork} selectedNetwork={fromNetwork} />

          <Box>
            <CustomSwapButton onClick={switchTransferType} />
          </Box>

          <L2Header networks={fromNetwork.to} selectedNetwork={toNetwork} onSelect={onSelectToNetwork} />
        </Box>
      </BridgeBox>

      <BridgeBox className="mb-3">
        <Box className="layer">
          <Box component="h3">
            Select an Asset
          </Box>

          <Box component="p">
            Available balance:&nbsp;
            {balances[swapDetails.currency] ?
              balances[swapDetails.currency].valueReadable : '0.00'}
            {` ${swapDetails.currency}`}
          </Box>
        </Box>

        <Box className="layer">
          <BridgeSwapInput
            L1Fee={L1Fee}
            L2Fee={L2Fee}
            balances={balances}
            value={swapDetails}
            onChange={setSwapDetails}
            feeCurrency={L2FeeToken}
            isOpenable={!(fromNetwork.from.key === "polygon" || (fromNetwork.from.key === "zksync" && toNetwork.key === "polygon"))}
            gasFetching={gasFetching}
          />
        </Box>

        <Box className="layer layer-end">
          <Box component="p">
            Estimated value:&nbsp;
            ~${formatUSD(estimatedValue)}
          </Box>
        </Box>
      </BridgeBox>

      <BridgeBox className="mb-3">
        <Box className="layer">
          <Box component="h3">
            Transaction Settings
          </Box>
        </Box>

        <Box className="layer mb-2">
          <Box component="h3" className="font-thin">
            Address
          </Box>

          <Box component="h3" className="font-thin">
            {user.address ? (
              <div className="bridge_connected_as">
                Connected Address
                <span className="bridge_bubble_connected" />
              </div>)
              : (
                <div className="bridge_connected_as">
                  Disconnected
                  <span className="bridge_bubble_disconnected" />
                </div>
              )}
          </Box>
        </Box>

        {user.address ?
          <Box>
            <BridgeInputBox><input placeholder={user.address} disabled={true} className="w-100 address-input"></input></BridgeInputBox>
          </Box>
          : ""
        }

        {transfer.type === "deposit" && user.address && !user.id && (
          <Box className="layer">
            <Box component="h4">
              One-Time Activation Fee: {" "}
              (~${usdFee})
            </Box>
            <Box component="h4">
              {activationFee} {swapDetails.currency}{" "}
              (~${usdFee})
            </Box>
          </Box>
        )}
        {user.address && user.id && !isSwapAmountEmpty && (
          <>
            {transfer.type === "withdraw" && (
              <>
                {fromNetwork.from.key === 'zksync' && toNetwork.key === 'ethereum' && (
                  <Box className="layer">
                    <Box>
                      <RadioButtons
                        horizontal
                        value={withdrawSpeed}
                        onChange={setWithdrawSpeed}
                        name={"withdrawSpeed"}
                        items={[
                          {
                            id: "fast",
                            name: "Fast",
                            disabled:
                              !api.apiProvider.eligibleFastWithdrawTokens?.includes(
                                swapDetails.currency
                              ),
                          },
                          { id: "normal", name: "Normal" },
                        ]}
                      />
                    </Box>
                    <Box>
                      <div style={{ display: 'flex', marginTop: 2 }}>
                        <div fontSize={12} color={"blue-gray-500"}>
                          Withdraw speed
                        </div>
                        <QuestionHelper text={renderLabel()} />
                      </div>
                    </Box>
                  </Box>
                )}
                {L2Fee && (
                  <Box className="layer">
                    <Box component="h4">
                      {fromNetwork.from.key === "zksync" && `zkSync L2 gas fee: `}
                    </Box>
                    <Box component="h4">
                      {fromNetwork.from.key === "zksync" && `~${L2Fee} ${L2FeeToken}`}
                    </Box>
                  </Box>
                )}
                {!L2Fee && (
                  <Box className="spinner">
                    <LoadingSpinner size={16} />
                  </Box>
                )}

                {transfer.type === "withdraw" && toNetwork.key === "ethereum" && (
                  <>
                    {isFastWithdraw && L1Fee && (
                      <Box className="layer">
                        <Box component="h4">
                          Ethereum L1 gas + bridge fee: {" "}
                        </Box>
                        <Box component="h4">
                          ~{formatPrice(L1Fee)}{" "}
                          {swapDetails.currency}
                        </Box>
                      </Box>
                    )}
                    <Box className="layer">
                      <Box component="h4" color={"blue-gray-300"}>
                        You'll receive:
                      </Box>
                      <Box component="h4" color={"blue-gray-300"}>
                        {isFastWithdraw ? ' ~' : ' '}
                        {isFastWithdraw && L1Fee
                          ? formatPrice(swapDetails.amount - L1Fee)
                          : formatPrice(swapDetails.amount)}
                        {" " + swapDetails.currency} on Ethereum L1
                      </Box>
                    </Box>
                  </>
                )}
              </>
            )}
            {transfer.type === "deposit" && (
              <>
                {L1Fee && (
                  <Box className="layer">
                    <Box component="h4">
                      {fromNetwork.from.key === "polygon" && `Polygon gas fee: `}
                      {fromNetwork.from.key === "ethereum" && `Gas fee: `}
                    </Box>
                    <Box component="h4">
                      {fromNetwork.from.key === "polygon" && `~${formatPrice(L1Fee)} MATIC`}
                      {fromNetwork.from.key === "ethereum" && `~${formatPrice(L1Fee)} ETH`}
                    </Box>
                  </Box>
                )}
                {!L1Fee && !hasError && (
                  <Box className="spinner">
                    <LoadingSpinner size={16} />
                  </Box>
                )}
                {transfer.type === "deposit" && (
                  <Box className="layer">
                    <Box component="h4">
                      You'll receive: {' '}
                    </Box>
                    <Box component="h4">
                      {fromNetwork.from.key === "polygon" && ` ~${formatPrice(swapDetails.amount)}`}
                      {toNetwork.key === "polygon" && ` ~${formatPrice(swapDetails.amount)}`}
                      {fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync" && ` ${formatPrice(swapDetails.amount)}`}

                      {fromNetwork.from.key === "polygon" && ` ETH on zkSync L2`}
                      {toNetwork.key === "polygon" && ` WETH on Polygon`}
                      {fromNetwork.from.key === "ethereum" && toNetwork.key === "zksync" && ` ${swapDetails.currency} on zkSync L2`}
                    </Box>
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </BridgeBox>

      {!user.address && <ConnectWalletButton isLoading={polygonLoding} />}
      {user.address && (
        <>
          {balances[swapDetails.currency] && !hasAllowance && !hasError
            && fromNetwork.from.key !== "polygon" && (
              <Button
                isLoading={isApproving}
                scale="md"
                disabled={
                  formErr.length > 0 ||
                  Number(swapDetails.amount) === 0 ||
                  swapDetails.currency === "ETH"
                }
                onClick={approveSpend}
              >
                APPROVE
              </Button>
            )}
          {hasError && (
            <Button
              variant="sell"
              scale="md"
            >
              {formErr}
            </Button>
          )}
          {hasAllowance && !hasError && (
            <Button
              isLoading={loading}
              disabled={
                formErr.length > 0 ||
                (L2Fee === null && L1Fee === null) ||
                !hasAllowance ||
                Number(swapDetails.amount) === 0
              }
              onClick={doTransfer}
            >
              TRANSFER
            </Button>
          )}
        </>
      )}
    </>
  );
};

export default Bridge;
