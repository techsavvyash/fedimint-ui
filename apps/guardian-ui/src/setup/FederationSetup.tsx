import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Text,
  Heading,
  Icon,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalCloseButton,
} from '@chakra-ui/react';
import { useTranslation } from '@fedimint/utils';
import { useSetupContext } from '../hooks';
import { GuardianRole, SetupProgress, SETUP_ACTION_TYPE } from '../types';
import { RoleSelector } from '../components/RoleSelector';
import { SetConfiguration } from '../components/SetConfiguration';
import { ConnectGuardians } from '../components/ConnectGuardians';
import { RunDKG } from '../components/RunDKG';
import { VerifyGuardians } from '../components/VerifyGuardians';
import { SetupComplete } from '../components/SetupComplete';
import { SetupProgress as SetupStepper } from '../components/SetupProgress';
import { TermsOfService } from '../components/TermsOfService';
import { getEnv } from '../utils/env';

import { ReactComponent as ArrowLeftIcon } from '../assets/svgs/arrow-left.svg';
import { ReactComponent as CancelIcon } from '../assets/svgs/x-circle.svg';
import { ServerStatus } from '@fedimint/types';

const PROGRESS_ORDER: SetupProgress[] = [
  SetupProgress.Start,
  SetupProgress.SetConfiguration,
  SetupProgress.ConnectGuardians,
  SetupProgress.RunDKG,
  SetupProgress.VerifyGuardians,
  SetupProgress.SetupComplete,
];

export const FederationSetup: React.FC = () => {
  const { t } = useTranslation();
  const {
    state: { progress, role, peers },
    dispatch,
    api,
  } = useSetupContext();
  const [needsTosAgreement, setNeedsTosAgreement] = useState(true);
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    async function getTos() {
      const tosPresent = !!(await getEnv()).tos;
      setNeedsTosAgreement(tosPresent);
    }
    getTos();
  }, []);

  const isHost = role === GuardianRole.Host;
  const isSolo = role === GuardianRole.Solo;
  const progressIdx = PROGRESS_ORDER.indexOf(progress);
  const prevProgress: SetupProgress | undefined =
    PROGRESS_ORDER[progressIdx - 1];
  const nextProgress: SetupProgress | undefined =
    PROGRESS_ORDER[progressIdx + 1];

  const handleBack = useCallback(() => {
    if (!prevProgress) return;
    dispatch({ type: SETUP_ACTION_TYPE.SET_PROGRESS, payload: prevProgress });
    window.scrollTo(0, 0);
  }, [dispatch, prevProgress]);

  const handleNext = useCallback(() => {
    if (!nextProgress) return;
    dispatch({ type: SETUP_ACTION_TYPE.SET_PROGRESS, payload: nextProgress });
    window.scrollTo(0, 0);
  }, [dispatch, nextProgress]);

  const handleRestart = useCallback(() => {
    api
      .restartSetup()
      .then(() => {
        dispatch({ type: SETUP_ACTION_TYPE.SET_INITIAL_STATE, payload: null });
        window.scrollTo(0, 0);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [api, dispatch]);

  let title: React.ReactNode;
  let subtitle: React.ReactNode;
  let canGoBack = false;
  let canRestart = false;
  let content: React.ReactNode;

  switch (progress) {
    case SetupProgress.Start:
      if (needsTosAgreement) {
        title = t('setup.progress.tos.title');
        content = <TermsOfService next={() => setNeedsTosAgreement(false)} />;
      } else {
        title = t('setup.progress.start.title');
        subtitle = t('setup.progress.start.subtitle');
        content = <RoleSelector next={handleNext} />;
      }
      break;
    case SetupProgress.SetConfiguration:
      title = isSolo
        ? t('setup.progress.set-config.title-solo')
        : t('setup.progress.set-config.title');
      subtitle = isHost
        ? t('setup.progress.set-config.subtitle-leader')
        : isSolo
        ? t('setup.progress.set-config.subtitle-solo')
        : t('setup.progress.set-config.subtitle-follower');
      content = <SetConfiguration next={handleNext} />;
      canGoBack = true;
      break;
    case SetupProgress.ConnectGuardians:
      title = isHost
        ? t('setup.progress.connect-guardians.title-leader')
        : t('setup.progress.connect-guardians.title-follower');
      subtitle = isHost
        ? t('setup.progress.connect-guardians.subtitle-leader')
        : t('setup.progress.connect-guardians.subtitle-follower');
      content = <ConnectGuardians next={handleNext} />;
      canGoBack = true;
      canRestart = true;
      break;
    case SetupProgress.RunDKG:
      title = t('setup.progress.run-dkg.title');
      subtitle = t('setup.progress.run-dkg.subtitle');
      content = <RunDKG next={handleNext} />;
      canRestart = true;
      break;
    case SetupProgress.VerifyGuardians:
      title = t('setup.progress.verify-guardians.title');
      subtitle = t('setup.progress.verify-guardians.subtitle');
      content = <VerifyGuardians next={handleNext} />;
      canRestart = true;
      break;
    case SetupProgress.SetupComplete:
      content = <SetupComplete />;
      break;
    default:
      title = t('setup.progress.error.title');
      subtitle = t('setup.progress.error.subtitle');
  }

  const isPeerRestarted =
    canRestart &&
    peers.some((peer) => peer.status === ServerStatus.SetupRestarted);

  return (
    <Flex
      direction='column'
      gap={[2, 10]}
      align={progressIdx === 0 ? 'start' : 'center'}
    >
      {progressIdx === 0 || !progressIdx ? null : (
        <SetupStepper setupProgress={progressIdx} isHost={isHost} />
      )}
      <Flex
        width={
          progress === SetupProgress.SetConfiguration
            ? ['100%', '90%', '70%']
            : ['100%', '90%']
        }
        direction='column'
        gap={[2, 10]}
        align='start'
      >
        <Flex
          width='100%'
          direction='row'
          justify='space-between'
          align='center'
        >
          {prevProgress && canGoBack && (
            <Button
              variant='link'
              onClick={handleBack}
              leftIcon={<Icon as={ArrowLeftIcon} />}
            >
              {t('common.back')}
            </Button>
          )}
          {canRestart && isHost && (
            <Button
              variant='link'
              colorScheme='red'
              onClick={() => setConfirmRestart(true)}
              rightIcon={<Icon as={CancelIcon} />}
            >
              {t('setup.common.restart-setup')}
            </Button>
          )}
        </Flex>
        {title && (
          <Heading size={['sm', 'md']} fontWeight='medium'>
            {title}
          </Heading>
        )}
        {subtitle && (
          <Text size={['sm', 'md']} fontWeight='medium'>
            {subtitle}
          </Text>
        )}
      </Flex>
      <Box width={['100%', '90%']} justifyItems='center'>
        {content}
      </Box>
      <Modal isOpen={isPeerRestarted} onClose={handleRestart}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('setup.common.restart-setup')}</ModalHeader>
          <ModalBody>{t('setup.common.restart-setup-alert')}</ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={handleRestart}>
              {t('setup.common.restart-setup')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={confirmRestart} onClose={() => setConfirmRestart(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalCloseButton />
          <ModalHeader>{t('setup.common.confirm-restart-setup')}</ModalHeader>
          <ModalBody>{t('setup.common.confirm-restart-setup-alert')}</ModalBody>
          <ModalFooter>
            <Button
              mr={3}
              onClick={() => {
                setConfirmRestart(false);
                handleRestart();
              }}
            >
              {t('setup.common.restart-setup')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
};
