import React, { Component } from 'react';
import socketIOClient from 'socket.io-client';
import Home from './Home';
import UserCard from '../UserCard';
import MessageCard from '../MessageCard';
import moment from 'moment';
import { MessageService, AuthenticationService, UserSearchService } from '../../services';
import { observer, inject } from 'mobx-react';
import { socketEndpoint, itemsPerPage } from '../../config.json';

@inject('authentication')
@observer
class HomeContainer extends Component {
    constructor (props) {
        super(props);
        this.currentPage = 0;
        this.state = {
            messages: [],
            userDropdownOptions: {},
            selectedUsers: {},
            userSearchLoading: false,
            recipient: null,
            loaderActive: false,
        };
        this.socket = socketIOClient(socketEndpoint);
        this.socketIOHandler();
    }
    socketIOHandler () {
        this.socket.on(this.props.authentication.token, messageResponse => {
            if (
                this.state.recipient &&
                (
                    this.state.recipient.email === messageResponse.to ||
                    this.state.recipient.email === messageResponse.from
                )
            ) {
                const messages = [... this.state.messages];
                messages.push(
                    <MessageCard
                        messageRef = {this.messageRef}
                        key = {Math.random()}
                        message = {messageResponse.message}
                        timestamp = {moment().format('hh:mm a')}
                        right = {messageResponse.from === this.props.authentication.email}
                        left = {messageResponse.from !== this.props.authentication.email}
                    />,
                );
                this.setMessagesState(messages);
            }
        });
    }
    async onLogout () {
        const { authentication } = this.props;
        try {
            await AuthenticationService.logout(authentication.token);
            authentication.refreshAuthentication();
        } catch (err) {
            throw err;
        }
    }
    onMessageScroll (event) {
        const yCoordinate = event.target && event.target.scrollTop;
        this.scrollHeight = event.target && event.target.scrollHeight;
        // Once all messages has been reached no need to make a request to the server.
        if (
            this.currentPage > 0 &&
            yCoordinate === 0 &&
            this.state.recipient &&
            !this.state.recipient.allMessagesRetrieved &&
            this.state.messages &&
            this.state.messages.length >= itemsPerPage
        ) {
            this.setState({ loaderActive: true }, async () => {
                try {
                    const messagesResponse = await MessageService.getConversation(
                        this.state.recipient.email,
                        ++this.currentPage,
                        itemsPerPage,
                        this.props.authentication.token
                    );
                    if (messagesResponse && messagesResponse.length === 0) {
                        return this.setState({
                            loaderActive: false,
                            recipient: { ... this.state.recipient, allMessagesRetrieved: true },
                        });
                    }
                    this.setState({ loaderActive: false }, () => {
                        const stateMessages = [... this.state.messages];
                        const messages = [];
                        for (let i = messagesResponse.length - 1; i >= 0; --i) {
                            const messageResponse = messagesResponse[i];
                            this.messageRef = React.createRef();
                            messages.push(
                                <MessageCard
                                    messageRef = {this.messageRef}
                                    key = {Math.random()}
                                    message = {messageResponse.message}
                                    timestamp = {moment().format('hh:mm a')}
                                    right = {messageResponse.from === this.props.authentication.email}
                                    left = {messageResponse.from !== this.props.authentication.email}
                                />,
                            );
                        }
                        if (this.state.recipient && !this.state.recipient.allMessagesRetrieved) {
                            this.setState({ messages: messages.concat(stateMessages) }, () => {
                                this.messageRef.current.scrollIntoView();
                            });
                        }
                    });
                } catch (err) {
                    this.setState({ loaderActive: false }, () => {
                        throw err;
                    });
                }
            });
        }
    }
    onUserSearch (event) {
        const { currentTarget: { value } } = event;
        if (value) {
            this.setState({ userSearchLoading: true }, async () => {
                const { authentication } = this.props;
                try {
                    const results = await UserSearchService.search(value, authentication.token);
                    const userDropdownOptions = {};
                    results.forEach(result => {
                        const { email } = result;
                        userDropdownOptions[email] = result;
                    });
                    this.setState({
                        userSearchLoading: false,
                        userDropdownOptions,
                    });
                } catch (err) {
                    this.setState({ userSearchLoading: false });
                    throw err;
                }
            });
        }
    }
    async onUserDropdownOptionSelect (event, { value: email }) {
        const { key } = event;
        if (key !== 'ArrowDown' && key !== 'ArrowUp') {
            const user = this.state.userDropdownOptions[email];
            const selectedUsers = { ... this.state.selectedUsers };
            let states = { recipient: user, userDropdownOptions: {} };
            if (!(user.email in this.state.selectedUsers)) {
                selectedUsers[email] = user;
                states.selectedUsers = selectedUsers;
            }
            this.setMessages(email, states);
        }
    }
    async onUserClick (email) {
        this.setState({ recipient: this.state.selectedUsers[email] });
        this.setMessages(email);
    }
    setMessagesState (messages, otherOptions) {
        this.setState({ messages, ... otherOptions }, () => {
            // Scroll into view will use the scroll bar of the nearest parent which is scrollable.
            this.messageRef && this.messageRef.current && this.messageRef.current.scrollIntoView();
        });
    }
    setMessages (email, otherOptions) {
        this.setState({ loaderActive: true }, async () => {
            try {
                const messagesResponse = await MessageService.getConversation(
                    email,
                    1,
                    itemsPerPage,
                    this.props.authentication.token
                );
                this.setState({ loaderActive: false }, () => {
                    this.currentPage = 1;
                    const messages = [];
                    for (let i = messagesResponse.length - 1; i >= 0; --i) {
                        const messageResponse = messagesResponse[i];
                        this.messageRef = React.createRef();
                        messages.push(
                            <MessageCard
                                messageRef = {this.messageRef}
                                key = {Math.random()}
                                message = {messageResponse.message}
                                timestamp = {moment().format('hh:mm a')}
                                right = {messageResponse.from === this.props.authentication.email}
                                left = {messageResponse.from !== this.props.authentication.email}
                            />,
                        );
                    }
                    this.setMessagesState(messages, otherOptions);
                });
            } catch (err) {
                this.setState({ loaderActive: true }, () => {
                    throw err;
                });
            }
        });
    }
    async sendMessage (event) {
        const { currentTarget: { value } } = event;
        event.currentTarget.value = '';
        try {
            const res = await MessageService.sendMessage({
                to: this.state.recipient.email,
                message: value,
            }, this.props.authentication.token);
            if (res.status >= 200) {
                this.messageRef = React.createRef();
                const messages = [... this.state.messages];
                messages.push(
                    <MessageCard
                        messageRef = {this.messageRef}
                        key = {Math.random()}
                        message = {value}
                        timestamp = {moment().format('hh:mm a')}
                        right
                    />,
                );
                this.setMessagesState(messages);
            }
        } catch (err) {
            throw err;
        }
    }
    onSendMessage (event) {
        if (event.key === 'Enter') {
            this.sendMessage(event);
        }
    }
    onCloseUserCard (email) {
        const selectedUsers = { ... this.state.selectedUsers };
        delete selectedUsers[email];
        let recipient = this.state.recipient;
        if (
            recipient &&
            typeof recipient === 'object' &&
            recipient.email === email
        ) {
            recipient = null;
            this.currentPage = 0;
        }
        this.setState({
            selectedUsers,
            recipient,
        });
    }
    render () {
        const { authentication: { id, email, firstName, lastName } } = this.props;
        return (
            <Home
                user = {{ id, email, firstName, lastName }}
                recipient = {this.state.recipient}
                selectedUsers = {Object.keys(this.state.selectedUsers).map(key => {
                    const user = this.state.selectedUsers[key];
                    return (
                        <UserCard
                            onClick = {this.onUserClick.bind(this)}
                            key = {user.id}
                            user = {user}
                            selected = {user.email === (this.state.recipient && this.state.recipient.email)}
                            onCloseUserCard = {this.onCloseUserCard.bind(this)}
                        />
                    );
                })}
                userDropdownOptions = {Object.keys(this.state.userDropdownOptions).map(key => {
                    const result = this.state.userDropdownOptions[key];
                    const { id, email, firstName, lastName } = result;
                    return {
                        key: id,
                        value: email,
                        text: `${firstName} ${lastName}`,
                    };
                })}
                userSearchLoading = {this.state.userSearchLoading}
                messages = {this.state.messages}
                onSendMessage = {this.onSendMessage.bind(this)}
                onLogout = {this.onLogout.bind(this)}
                onUserSearch = {this.onUserSearch.bind(this)}
                onUserDropdownOptionSelect = {this.onUserDropdownOptionSelect.bind(this)}
                onMessageScroll = {this.onMessageScroll.bind(this)}
                loaderActive = {this.state.loaderActive}
            />
        );
    }
}

export default HomeContainer;
