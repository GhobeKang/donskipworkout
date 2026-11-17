import useOnboarding from '../../_hooks/useOnboarding';
import AuthenticatedApp from '../app/AuthenticatedApp';
import StatusBar from '../layout/StatusBar';
import RequestState from '../ui/RequestState';
import OnboardingScreen from './OnboardingScreen';

export default function OnboardingGate({ user, on_unauthorized, on_logout, on_account_deleted }) {
  const onboarding = useOnboarding({ on_unauthorized });
  if (onboarding.loading || !onboarding.data) return <div className="phoneShell">
    <StatusBar />
    <main className="appContent"><RequestState loading={onboarding.loading} error={onboarding.error} on_retry={onboarding.reload} /></main>
  </div>;
  if (onboarding.data.required && onboarding.data.status !== 'deferred') {
    return <OnboardingScreen key={`${user.user_uuid}:${onboarding.reload_revision}`}
      data={onboarding.data} pending={onboarding.pending} error={onboarding.error}
      on_reload={onboarding.reload} on_save={onboarding.save_progress} />;
  }
  return <AuthenticatedApp user={user} on_unauthorized={on_unauthorized} on_logout={on_logout}
    on_account_deleted={on_account_deleted} onboarding={onboarding.data}
    onboarding_pending={onboarding.pending} onboarding_error={onboarding.error}
    on_resume_onboarding={() => onboarding.save_progress(onboarding.data.draft, onboarding.data.current_step)} />;
}
