import { DeletableEdge } from "./deletable-edge";

export { DeletableEdge };

/** Tipo padrão de toda conexão do canvas (ver defaultEdgeOptions no editor). */
export const DELETABLE_EDGE = "deletable";

export const sequenceEdgeTypes = { [DELETABLE_EDGE]: DeletableEdge };
