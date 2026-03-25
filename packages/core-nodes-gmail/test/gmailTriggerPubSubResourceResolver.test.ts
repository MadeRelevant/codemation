import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailTriggerPubSubResourceResolver } from "../src/services/GmailTriggerPubSubResourceResolver";

test("GmailTriggerPubSubResourceResolver uses explicit cfg values when both are set", () => {
  const resolver = new GmailTriggerPubSubResourceResolver({});
  const resolved = resolver.resolve(
    { topicName: "projects/p/topics/t1", subscriptionName: "projects/p/subscriptions/s1" },
    undefined,
  );
  assert.deepEqual(resolved, {
    topicName: "projects/p/topics/t1",
    subscriptionName: "projects/p/subscriptions/s1",
  });
});

test("GmailTriggerPubSubResourceResolver derives defaults from project id hint", () => {
  const resolver = new GmailTriggerPubSubResourceResolver({});
  const resolved = resolver.resolve({}, "my-gcp-project");
  assert.deepEqual(resolved, {
    topicName: "projects/my-gcp-project/topics/codemation-gmail",
    subscriptionName: "projects/my-gcp-project/subscriptions/codemation-gmail",
  });
});

test("GmailTriggerPubSubResourceResolver reads GOOGLE_CLOUD_PROJECT from env when hint is absent", () => {
  const resolver = new GmailTriggerPubSubResourceResolver({
    GOOGLE_CLOUD_PROJECT: "env-project",
  });
  const resolved = resolver.resolve({}, undefined);
  assert.deepEqual(resolved, {
    topicName: "projects/env-project/topics/codemation-gmail",
    subscriptionName: "projects/env-project/subscriptions/codemation-gmail",
  });
});

test("GmailTriggerPubSubResourceResolver prefers GMAIL_TRIGGER_* env vars", () => {
  const resolver = new GmailTriggerPubSubResourceResolver({
    GMAIL_TRIGGER_TOPIC_NAME: "projects/env/topics/from-env",
    GMAIL_TRIGGER_SUBSCRIPTION_NAME: "projects/env/subscriptions/from-env",
  });
  const resolved = resolver.resolve({}, undefined);
  assert.deepEqual(resolved, {
    topicName: "projects/env/topics/from-env",
    subscriptionName: "projects/env/subscriptions/from-env",
  });
});

test("GmailTriggerPubSubResourceResolver returns undefined when nothing can be inferred", () => {
  const projectKeys = ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT", "GCLOUD_PROJECT"] as const;
  const triggerKeys = ["GMAIL_TRIGGER_TOPIC_NAME", "GMAIL_TRIGGER_SUBSCRIPTION_NAME"] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of [...projectKeys, ...triggerKeys]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const resolver = new GmailTriggerPubSubResourceResolver({});
    assert.equal(resolver.resolve({}, undefined), undefined);
  } finally {
    for (const k of [...projectKeys, ...triggerKeys]) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  }
});

test("GmailTriggerPubSubResourceResolver falls back to process.env when injected env omits GOOGLE_CLOUD_PROJECT", () => {
  const prior = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.GOOGLE_CLOUD_PROJECT = "from-process";
  try {
    const resolver = new GmailTriggerPubSubResourceResolver({});
    const resolved = resolver.resolve({}, undefined);
    assert.deepEqual(resolved, {
      topicName: "projects/from-process/topics/codemation-gmail",
      subscriptionName: "projects/from-process/subscriptions/codemation-gmail",
    });
  } finally {
    if (prior === undefined) {
      delete process.env.GOOGLE_CLOUD_PROJECT;
    } else {
      process.env.GOOGLE_CLOUD_PROJECT = prior;
    }
  }
});
