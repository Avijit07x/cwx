import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useState, type CSSProperties } from 'react';
import { CATALOG } from '../domain/catalog';
import { useSelectedItem } from '../state/selectors';
import styles from './Viewport.module.css';

const LIFT_ABOVE_ITEM = 0.12;
const ABOVE_ANCHOR: CSSProperties = { transform: 'translate3d(-50%, -100%, 0)' };

export function SelectionTag() {
  const [canvasDrawn, setCanvasDrawn] = useState(false);
  const item = useSelectedItem();

  useFrame(() => {
    if (!canvasDrawn) setCanvasDrawn(true);
  });

  if (!item || !canvasDrawn) return null;
  return (
    <Html
      position={[item.x, CATALOG[item.kind].height + LIFT_ABOVE_ITEM, item.z]}
      style={ABOVE_ANCHOR}
      className={styles.tagAnchor}
    >
      <span className={styles.tag} aria-hidden="true">
        {item.tag}
      </span>
    </Html>
  );
}
