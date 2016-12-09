import * as chai from 'chai';
import * as socketIoClient from 'socket.io-client';
import * as socketServer from './../../lib/server/socket_server';
import {PullRequestRepository} from '../../lib/repository';
import {PullRequest, PullRequestEvent} from '../../lib/model';
import {EventDispatcher} from '../../lib/events/event_dispatcher';
import {Config} from '../../lib/config';
import {PullRequestWithActor} from '../../lib/server/event_payload_handler';
import {PullRequestFaker, ReviewerFaker, ProjectFaker, UserFaker} from '../faker/model_faker';

var expect = chai.expect;

var prFaker = new PullRequestFaker();
var reviewerFaker = new ReviewerFaker();
var projectFaker = new ProjectFaker();
var userFaker = new UserFaker();

describe('SocketServer', () => {
    var options = {
        'force new connection': true
    };
    var socketPort = 4321;

    before(() => {
        var config = {
            baseUrl: 'http://example.com',
            teamName: 'aaaa',
            user: 'my.user',
            password: 'topsecret',
            webhook_port: 1234,
            socket_port: socketPort
        };
        Config.reset();
        Config.setUp({config: config});

        socketServer.SocketServer.startSocketServer();
    });

    after(() => {
        socketServer.SocketServer.stopSocketServer();
    });

    it('should emit server:introduced on client:introduce event', (done) => {
        var client = socketIoClient.connect('http://localhost:' + socketPort, options);
        client.on('server:introduced', () => {
            client.disconnect();
            done();
        });

        client.emit('client:introduce');
    });

    it("should emit intro message with user's pull requests and assigned pull requests", (done) => {
        var projectName = 'team_name/repo_name';
        var project = projectFaker.fake({fullName: projectName});

        var username = 'john.smith';
        var reviewer = reviewerFaker.fake({user: {username: username}});

        var authoredPullRequest = prFaker.fake({targetRepository: project, author: {username: username}});
        var assignedPullRequest = prFaker.fake({targetRepository: project, reviewers: [reviewer]});

        PullRequestRepository.pullRequests['team_name/repo_name'] = [
            authoredPullRequest,
            assignedPullRequest
        ];

        var client = socketIoClient.connect('http://localhost:' + socketPort, options);
        client.on('server:introduced', (pullRequests: PullRequestEvent) => {
            expect(pullRequests.sourceEvent).to.eq('client:introduce');
            expect(pullRequests.pullRequests.length).to.eq(2);

            expect(pullRequests.pullRequests[0].id).to.eq(authoredPullRequest.id);
            expect(pullRequests.pullRequests[1].id).to.eq(assignedPullRequest.id);

            client.disconnect();
            done();
        });

        client.emit('client:introduce', username);
    });

    it('should notify reviewers who haven\'t approved the pull request yet on client:remind', (done) => {
        var approvedReviewer = reviewerFaker.fake({approved: true});
        var unapprovedReviewer = reviewerFaker.fake({approved: false});

        var pullRequest = prFaker.fake({reviewers: [approvedReviewer, unapprovedReviewer]});

        PullRequestRepository.pullRequests['team_name/repo_name'] = [
            pullRequest
        ];

        var client = socketIoClient.connect('http://localhost:' + socketPort, options);
        client.on('server:introduced', () => {
            client.on('server:remind', (pullRequestToRemind: PullRequest) => {
                expect(pullRequestToRemind.id).to.eq(pullRequest.id);
                client.disconnect();
                done();
            });

            client.emit('client:remind', pullRequest);
        });

        client.emit('client:introduce', unapprovedReviewer.user.username);
    });

    describe('Emitting pull requests via sockets to author', () => {
        var dispatcher = EventDispatcher.getInstance();

        function testEmittingEventViaSocket(inputEvent: string, done): void {
            var username = 'john.smith';

            var projectName = 'team_name/repo_name';
            var project = projectFaker.fake({fullName: projectName});

            var reviewer = reviewerFaker.fake({user: {username: username}});

            var authoredPullRequest = prFaker.fake({author: {username: username}, targetRepository: project});
            var assignedPullRequest = prFaker.fake({reviewers: [reviewer], targetRepository: project});

            var payload = new PullRequestWithActor();
            payload.pullRequest = authoredPullRequest;
            payload.actor = userFaker.fake();

            PullRequestRepository.pullRequests['team_name/repo_name'] = [
                authoredPullRequest,
                assignedPullRequest
            ];

            var client = socketIoClient.connect('http://localhost:' + socketPort, options);
            client.emit('client:introduce', username);

            var reviewerClient = socketIoClient.connect('http://localhost:' + socketPort, options);
            reviewerClient.emit('client:introduce');

            client.on('server:introduced', () => {
                client.on('server:pullrequests:updated', (pullRequestEvent: PullRequestEvent) => {
                    expect(pullRequestEvent.sourceEvent).to.eq(inputEvent);
                    expect(pullRequestEvent.context.id).to.eq(authoredPullRequest.id);
                    expect(pullRequestEvent.context.title).to.eq(authoredPullRequest.title);
                    expect(pullRequestEvent.actor.username).to.eq(payload.actor.username);
                    expect(pullRequestEvent.pullRequests.length).to.eq(2);

                    client.disconnect();
                    done();
                });

                dispatcher.emit(inputEvent, payload);
            });
        }

        it('should emit server:pullrequests:updated on webhook:pullrequest:created', (done) => {
            var inputEvent = 'webhook:pullrequest:created';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:updated', (done) => {
            var inputEvent = 'webhook:pullrequest:updated';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:approved', (done) => {
            var inputEvent = 'webhook:pullrequest:approved';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:unapproved', (done) => {
            var inputEvent = 'webhook:pullrequest:unapproved';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:fulfilled', (done) => {
            var inputEvent = 'webhook:pullrequest:fulfilled';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:rejected', (done) => {
            var inputEvent = 'webhook:pullrequest:rejected';
            testEmittingEventViaSocket(inputEvent, done);
        });
    });

    describe('Emitting pull requests via sockets to reviewers', () => {
        var dispatcher = EventDispatcher.getInstance();

        function testEmittingEventViaSocket(inputEvent: string, done): void {
            var reviewerUsername = 'anna.kowalsky';

            var projectName = 'team_name/repo_name';
            var project = projectFaker.fake({fullName: projectName});

            var reviewer = reviewerFaker.fake({user: {username: reviewerUsername}});

            var authoredPullRequest = prFaker.fake({author: {username: reviewerUsername}, targetRepository: project});
            var assignedPullRequest = prFaker.fake({reviewers: [reviewer], targetRepository: project});

            var payload = new PullRequestWithActor();
            payload.pullRequest = assignedPullRequest;
            payload.actor = userFaker.fake();

            PullRequestRepository.pullRequests['team_name/repo_name'] = [
                authoredPullRequest,
                assignedPullRequest
            ];

            var client = socketIoClient.connect('http://localhost:' + socketPort, options);

            try {
                client.emit('client:introduce', reviewerUsername);

                client.on('server:introduced', () => {
                    client.on('server:pullrequests:updated', (pullRequests: PullRequestEvent) => {
                        expect(pullRequests.sourceEvent).to.eq(inputEvent);
                        expect(pullRequests.context.id).to.eq(assignedPullRequest.id);
                        expect(pullRequests.actor.username).to.eq(payload.actor.username);

                        expect(pullRequests.pullRequests.length).to.eq(2);

                        client.disconnect();
                        done();
                    });

                    dispatcher.emit(inputEvent, payload);
                });
            } catch (e) {
                done(e);
            }
        }

        it('should emit server:pullrequests:updated on webhook:pullrequest:created', (done) => {
            var inputEvent = 'webhook:pullrequest:created';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:updated', (done) => {
            var inputEvent = 'webhook:pullrequest:updated';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:approved', (done) => {
            var inputEvent = 'webhook:pullrequest:approved';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:unapproved', (done) => {
            var inputEvent = 'webhook:pullrequest:unapproved';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:fulfilled', (done) => {
            var inputEvent = 'webhook:pullrequest:fulfilled';
            testEmittingEventViaSocket(inputEvent, done);
        });

        it('should emit server:pullrequests:updated on webhook:pullrequest:rejected', (done) => {
            var inputEvent = 'webhook:pullrequest:rejected';
            testEmittingEventViaSocket(inputEvent, done);
        });
    });
});
