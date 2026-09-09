import { describe, it, expect, beforeEach } from "vitest";
import {
  useProfiles,
  localProfile,
  LOCAL_PROFILE_ID,
  type ProfilesState,
} from "./profiles";

const freshState = (): ProfilesState => ({
  profiles: [localProfile()],
  activeProfileId: LOCAL_PROFILE_ID,
});

describe("profiles store", () => {
  beforeEach(() => {
    useProfiles.setState(freshState());
  });

  it("ships with the built-in Local profile pointing at localhost:4566", () => {
    const { profiles, activeProfileId } = useProfiles.getState();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: LOCAL_PROFILE_ID,
      name: "Local",
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      builtIn: true,
    });
    expect(activeProfileId).toBe(LOCAL_PROFILE_ID);
  });

  it("adds a profile and keeps the current selection", () => {
    const before = useProfiles.getState().activeProfileId;
    const added = useProfiles.getState().addProfile({
      name: "Pro",
      endpoint: "http://localhost:4566",
      region: "eu-west-1",
      authToken: "tok",
    });

    expect(added).toMatchObject({ name: "Pro", region: "eu-west-1", authToken: "tok" });
    expect(added.builtIn).toBeFalsy();
    expect(useProfiles.getState().profiles).toHaveLength(2);
    expect(useProfiles.getState().activeProfileId).toBe(before);
  });

  it("switches the active profile", () => {
    const added = useProfiles.getState().addProfile({
      name: "Other",
      endpoint: "http://localhost:4577",
      region: "us-east-1",
    });
    useProfiles.getState().setActiveProfile(added.id);
    expect(useProfiles.getState().activeProfileId).toBe(added.id);
  });

  it("updates a profile in place", () => {
    const added = useProfiles.getState().addProfile({
      name: "Other",
      endpoint: "http://localhost:4577",
      region: "us-east-1",
    });
    useProfiles.getState().updateProfile(added.id, { region: "ap-south-1" });
    const found = useProfiles.getState().profiles.find((p) => p.id === added.id);
    expect(found?.region).toBe("ap-south-1");
    expect(found?.name).toBe("Other");
  });

  it("refuses to remove the built-in Local profile", () => {
    expect(() => useProfiles.getState().removeProfile(LOCAL_PROFILE_ID)).toThrow(/built-in/i);
    expect(useProfiles.getState().profiles).toHaveLength(1);
  });

  it("removes a custom profile and reselects a survivor", () => {
    const added = useProfiles.getState().addProfile({
      name: "Other",
      endpoint: "http://localhost:4577",
      region: "us-east-1",
    });
    useProfiles.getState().setActiveProfile(added.id);
    useProfiles.getState().removeProfile(added.id);

    const state = useProfiles.getState();
    expect(state.profiles.map((p) => p.id)).not.toContain(added.id);
    expect(state.activeProfileId).toBe(LOCAL_PROFILE_ID);
  });
});
