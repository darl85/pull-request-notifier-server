import * as Server from 'socket.io';
import {PullRequestRepository} from '../repository';
import {
    SocketClientEvent, PullRequest, PullRequestEvent, SocketServerEvent, Reviewer, WebhookEvent,
    User
} from '../model';
import {EventDispatcher} from '../events/event_dispatcher';
import logger = require('./../logger');
import {Config} from '../config';
import * as _ from 'lodash';

export class SocketServer {
    static io: SocketIO.Server;
    static startSocketServer(): void {
        const config = Config.getConfig();
        const socketPort = config.socket_port;

        logger.logSocketServerStart(socketPort.toString());
        this.io = Server(socketPort);
        const dispatcher = EventDispatcher.getInstance();

        this.io.on('connection', (socket) => {
            logger.logClientConnected();

            socket.on(SocketClientEvent.INTRODUCE, (username: string) => {
                logger.logClientIntroduced(username);
                socket.join(username);

                const userPullRequests = new PullRequestEvent();
                userPullRequests.sourceEvent = SocketClientEvent.INTRODUCE;
                userPullRequests.pullRequests = PullRequestRepository.findByUser(username);

                logger.logEmittingEventToUser(SocketServerEvent.INTRODUCED, username);
                this.io.to(username).emit(SocketServerEvent.INTRODUCED, userPullRequests);
            });

            socket.on(SocketClientEvent.REMIND, (pullRequest: PullRequest) => {
                logger.logReminderReceived();
                const reviewersToRemind: string[] = _.map(
                    _.filter(pullRequest.reviewers, (reviewer: Reviewer) => {
                        return !reviewer.approved;
                    }),
                    (reviewer: Reviewer) => {
                        return reviewer.user.username;
                    }
                );

                let reviewerIdx = 0, reviewersLen = reviewersToRemind.length;
                for (; reviewerIdx < reviewersLen; reviewerIdx++) {
                    const reviewerUsername = reviewersToRemind[reviewerIdx];
                    logger.logSendingReminderToUser(reviewerUsername);
                    this.io.to(reviewerUsername).emit(SocketServerEvent.REMIND, pullRequest);
                }
            });
        });

        dispatcher.on(WebhookEvent.PULLREQUEST_CREATED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_CREATED, body.pullRequest, body.actor);
        });
        dispatcher.on(WebhookEvent.PULLREQUEST_UPDATED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_UPDATED, body.pullRequest, body.actor);
        });
        dispatcher.on(WebhookEvent.PULLREQUEST_APPROVED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_APPROVED, body.pullRequest, body.actor);
        });
        dispatcher.on(WebhookEvent.PULLREQUEST_UNAPPROVED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_UNAPPROVED, body.pullRequest, body.actor);
        });
        dispatcher.on(WebhookEvent.PULLREQUEST_FULFILLED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_FULFILLED, body.pullRequest, body.actor);
        });
        dispatcher.on(WebhookEvent.PULLREQUEST_REJECTED, (body: {pullRequest: PullRequest, actor: User}) => {
            SocketServer.onWebhookEvent(WebhookEvent.PULLREQUEST_REJECTED, body.pullRequest, body.actor);
        });
    }

    static stopSocketServer(): void {
        this.io.close();
    }

    private static onWebhookEvent(eventName: string, pullRequest: PullRequest, actor: User): void {
        logger.logWebhookEventReceived(eventName);
        const author = pullRequest.author.username;

        const userPullRequests = new PullRequestEvent();
        userPullRequests.actor = actor;
        userPullRequests.sourceEvent = eventName;
        userPullRequests.context = pullRequest;
        // @todo Bring back authored and assigned pull requests
        userPullRequests.pullRequests = PullRequestRepository.findByUser(author);

        logger.logEmittingEventToUser(SocketServerEvent.PULLREQUESTS_UPDATED, author);
        SocketServer.io.to(author).emit(SocketServerEvent.PULLREQUESTS_UPDATED, userPullRequests);

        const reviewers: Array<Reviewer> = pullRequest.reviewers || [];

        let reviewerIdx = 0, reviewersLength = reviewers.length;
        for (; reviewerIdx < reviewersLength; reviewerIdx++) {
            const reviewerUsername = reviewers[reviewerIdx].user.username;
            const reviewerPr = new PullRequestEvent();
            reviewerPr.sourceEvent = eventName;
            reviewerPr.actor = actor;
            reviewerPr.context = pullRequest;
            // @todo Bring back authored and assigned pull requests
            reviewerPr.pullRequests = PullRequestRepository.findByUser(reviewerUsername);

            logger.logEmittingEventToUser(SocketServerEvent.PULLREQUESTS_UPDATED, reviewerUsername);
            SocketServer.io.to(reviewerUsername).emit(SocketServerEvent.PULLREQUESTS_UPDATED, reviewerPr);
        }
    }
}
