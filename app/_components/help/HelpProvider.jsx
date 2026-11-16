'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import HelpGuide from './HelpGuide';
import useFirstUseGuide from '../../_hooks/useFirstUseGuide';

const help_context = createContext(null);

export function useHelp() {
  const help = useContext(help_context);
  if (!help) throw new Error('Help components require HelpProvider.');
  return help;
}

export default function HelpProvider({ children, on_navigate, navigation_pending, user_uuid, has_completed_checkin, on_unauthorized }) {
  const first_use_guide = useFirstUseGuide({ user_uuid, has_completed_checkin, on_unauthorized });
  const [help_request, set_help_request] = useState(null);
  const open_help = useCallback((question_id = null) => set_help_request({ question_id }), []);
  const close_help = useCallback(() => set_help_request(null), []);
  const context_value = useMemo(() => ({ open_help, first_use_guide }), [open_help, first_use_guide]);
  const visit_destination = async (view) => {
    const did_navigate = await on_navigate(view);
    if (did_navigate !== false) close_help();
    return did_navigate;
  };

  return <help_context.Provider value={context_value}>
    {children}
    {help_request && <HelpGuide question_id={help_request.question_id} on_close={close_help}
      on_navigate={visit_destination} navigation_pending={navigation_pending} />}
  </help_context.Provider>;
}
