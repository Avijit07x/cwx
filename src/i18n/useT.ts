import { useEditor } from '../state/store';
import { getTranslator, type Translator } from './translate';

export function useT(): Translator {
  return getTranslator(useEditor((state) => state.locale));
}
