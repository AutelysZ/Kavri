import { Phase } from './field.js';

export enum Strategy {
  /**
   * If this decorator passes, stop the entire pipeline (all phases).
   */
  ShortCircuit,

  /**
   * Pass if any decorator in this phase passes.
   * Stop evaluating remaining decorators in this phase after first pass.
   */
  AnyPass,

  /**
   * Stop the entire pipeline immediately when this decorator fails.
   */
  FailFast,

  /**
   * Continue evaluating even if this decorator fails.
   * Final result depends on aggregated errors.
   */
  ContinueOnError,
}

export const DecoratorPhaseStrategy: Readonly<Record<Phase, Strategy>> = {
  [Phase.Info]: Strategy.ContinueOnError,
  [Phase.Defaults]: Strategy.ShortCircuit,
  [Phase.Presence]: Strategy.ShortCircuit,
  [Phase.Coercion]: Strategy.AnyPass,
  [Phase.Type]: Strategy.AnyPass,
  [Phase.Normalization]: Strategy.FailFast,
  [Phase.Semantics]: Strategy.ContinueOnError,
  [Phase.TextEncoding]: Strategy.FailFast,
  [Phase.BinaryEncoding]: Strategy.FailFast,
  [Phase.ContentType]: Strategy.FailFast,
  [Phase.Property]: Strategy.ContinueOnError,
  [Phase.Composition]: Strategy.ContinueOnError,
  [Phase.AdditionalConstraints]: Strategy.ContinueOnError,
};

export const FieldSchemaDecoratorName = Symbol('schema:name');
