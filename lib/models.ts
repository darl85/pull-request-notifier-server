/// <reference path="../typings/tsd.d.ts" />

export interface ModelInterface {}

export class Project implements ModelInterface {
    name: string;
    fullName: string;
    pullRequestsUrl: string;
}

export class User implements ModelInterface {
    username: string;
    displayName: string;
}

export class Reviewer implements ModelInterface {
    approved: boolean;
    user: User;
}

export enum PullRequestState {Open, Merged, Declined}

export class PullRequest implements ModelInterface {
    id: number;
    title: string;
    description: string;
    author: User;
    targetRepository: Project;
    targetBranch: string;
    reviewers: Array<Reviewer> = [];
    state: PullRequestState;
    selfLink: string;
}

// @todo Add context pull request (that triggered a webhook)
export class PullRequestEvent {
    sourceEvent: string = '';
    authored: Array<PullRequest> = [];
    assigned: Array<PullRequest> = [];
}
