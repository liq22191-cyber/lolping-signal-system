import { createContext, useContext } from 'react';
import { strings, type Strings } from '../../shared/i18n';

/** The settings page's strings, in the language the app resolved (setting, or the system display language). */
export const TextContext = createContext<Strings>(strings('en'));

export const useText = (): Strings => useContext(TextContext);
