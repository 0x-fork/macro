type ImplModule = typeof import('./impl');

let initialized = false;
let impl: ImplModule | null = null;

export function isInitialized() {
  return initialized;
}

export function setInitialized(value: boolean) {
  initialized = value;
}

/** The lazily-loaded Datadog module; null until init() resolves. */
export function getImpl() {
  return impl;
}

export function setImpl(module: ImplModule) {
  impl = module;
}
