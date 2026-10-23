import { useEffect, useState } from "react";
import type { FeedState, LogFeed } from "./feed";
import { applyFeedEvent } from "./feed";

/** Subscribes to a feed and returns its current state. */
export function useFeed(feed: LogFeed): FeedState {
  const [state, setState] = useState<FeedState>(() => feed.getSnapshot());

  useEffect(() => {
    const unsubscribe = feed.subscribe(event => {
      setState(previous => applyFeedEvent(previous, event));
    });

    setState(feed.getSnapshot());

    return unsubscribe;
  }, [feed]);

  return state;
}
