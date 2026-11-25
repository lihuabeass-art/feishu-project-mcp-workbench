// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ScheduleAvatar, ScheduleAvatarCacheProvider } from "./ScheduleAvatar";
import type { SchedulePerson } from "./scheduleApi";

afterEach(cleanup);
const person: SchedulePerson = { id: "peer", name: "施伟", connection: "c", project: "p" };

it("同一进程中不同节点共用已知头像，后续缺少头像地址不会回退为姓名首字", async () => {
  const page = render(<ScheduleAvatarCacheProvider scope="avatar-reuse" people={[{ ...person, avatar: "peer.png" }]}>
    <ScheduleAvatar person={person} /><ScheduleAvatar person={person} />
  </ScheduleAvatarCacheProvider>);
  await waitFor(() => expect(page.container.querySelectorAll('img[src="peer.png"]')).toHaveLength(2));
  page.rerender(<ScheduleAvatarCacheProvider scope="avatar-reuse" people={[person]}>
    <ScheduleAvatar person={person} /><ScheduleAvatar person={person} />
  </ScheduleAvatarCacheProvider>);
  expect(page.container.querySelectorAll('img[src="peer.png"]')).toHaveLength(2);
  page.unmount();
  const reopened = render(<ScheduleAvatarCacheProvider scope="avatar-reuse" people={[person]}>
    <ScheduleAvatar person={person} />
  </ScheduleAvatarCacheProvider>);
  expect(reopened.container.querySelector('img[src="peer.png"]')).toBeTruthy();
});

it("头像补齐后更新所有已显示实例，按账号连接及空间隔离同名同 ID 人员", async () => {
  const renderPeople = (scope: string, people: SchedulePerson[]) => <ScheduleAvatarCacheProvider scope={scope} people={people}>
    <ScheduleAvatar person={person} /><ScheduleAvatar person={{ ...person, project: "another" }} />
  </ScheduleAvatarCacheProvider>;
  const page = render(renderPeople("account-one", []));
  expect(page.container.querySelectorAll("img")).toHaveLength(0);
  page.rerender(renderPeople("account-one", [{ ...person, avatar: "first.png" }]));
  await waitFor(() => expect(page.container.querySelectorAll("img")).toHaveLength(1));
  page.rerender(renderPeople("account-two", []));
  expect(page.container.querySelectorAll("img")).toHaveLength(0);
});

it("同一人员节点携带不同非空地址时共用缓存，失效后统一切换到已知可用候选", async () => {
  const page = render(<ScheduleAvatarCacheProvider scope="avatar-alternates" people={[]}>
    <ScheduleAvatar person={{ ...person, avatar: "expired.png" }} />
    <ScheduleAvatar person={{ ...person, avatar: "current.png" }} />
  </ScheduleAvatarCacheProvider>);
  await waitFor(() => expect(page.container.querySelectorAll('img[src="expired.png"]')).toHaveLength(2));
  fireEvent.error(page.container.querySelector('img[src="expired.png"]')!);
  await waitFor(() => expect(page.container.querySelectorAll('img[src="current.png"]')).toHaveLength(2));
  expect(page.container.textContent).toBe("");
});
