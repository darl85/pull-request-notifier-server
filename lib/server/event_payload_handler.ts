///<reference path="../../typings/tsd.d.ts"/>

import repositories = require('./../repositories');
import factories = require('./../factories');
import logger = require('./../logger');
import eventDispatcher = require('./../events/event_dispatcher');

export interface HandlerInterface {
    supportedEvents: Array<string>;
    handlePayload(type: string, bodyDecoded: any): void;
}

export class PullRequestHandler implements HandlerInterface {
    supportedEvents: Array<string> = [
        'pullrequest:created',
        'pullrequest:updated',
        'pullrequest:fulfilled',
        'pullrequest:rejected',
        'pullrequest:approved',
        'pullrequest:unapproved',
    ];

    private PULLREQUEST_CREATED: string = 'pullrequest:created';
    private PULLREQUEST_UPDATED: string = 'pullrequest:updated';

    private PULLREQUEST_FULFILLED: string = 'pullrequest:fulfilled';
    private PULLREQUEST_REJECTED: string = 'pullrequest:rejected';

    private PULLREQUEST_APPROVED: string = 'pullrequest:approved';
    private PULLREQUEST_UNAPPROVED: string = 'pullrequest:unapproved';

    handlePayload(type: string, bodyDecoded: any): void {
        switch (type) {
            case this.PULLREQUEST_CREATED:
                this.onPullRequestCreated(bodyDecoded);
                break;
            case this.PULLREQUEST_UPDATED:
            case this.PULLREQUEST_APPROVED:
            case this.PULLREQUEST_UNAPPROVED:
                this.onPullRequestUpdated(bodyDecoded);
                break;
            case this.PULLREQUEST_FULFILLED:
            case this.PULLREQUEST_REJECTED:
                this.onPullRequestClosed(bodyDecoded);
                break;
            default:
                logger.info('Unhandled event payload: ' + type);
                return;
        }
    }

    private onPullRequestCreated(body: any): void {
        logger.info('Adding a pull request to the repository');
        var newPullRequest = factories.PullRequestFactory.create(body.pullrequest);
        repositories.PullRequestRepository.add(newPullRequest);
    }

    private onPullRequestUpdated(body: any): void {
        logger.info('Updating a pull request');
        var pullRequest = factories.PullRequestFactory.create(body.pullrequest);
        repositories.PullRequestRepository.update(pullRequest);
    }

    private onPullRequestClosed(body: any): void {
        logger.info('Closing a pull request');
        var pullRequest = factories.PullRequestFactory.create(body.pullrequest);
        repositories.PullRequestRepository.remove(pullRequest);
    }
}

export class EventPayloadHandler {
    private static handlers: Array<HandlerInterface> = [
        new PullRequestHandler()
    ];

    static handlePayload(type: string, bodyEncoded: string): void {
        var bodyDecoded = JSON.parse(bodyEncoded);
        for (var handlerIndex = 0; handlerIndex < this.handlers.length; handlerIndex++) {
            var handler: HandlerInterface = this.handlers[handlerIndex];
            if (handler.supportedEvents.indexOf(type) !== -1) {
                handler.handlePayload(type, bodyDecoded);
                this.triggerEvent(type, bodyDecoded);
            }
        }
    }

    private static triggerEvent(payloadType: string, contents: any = {}): void {
        var eventName = 'webhook:' + payloadType;
        eventDispatcher.EventDispatcher.getInstance().emit(eventName, contents);
    }
}
