/*
 * Copyright (c) 2014 CoNWeT Lab., Universidad Politécnica de Madrid
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var Widget = (function () {

  'use strict';

  var Widget = function Widget(containerSelector, modalSelector) {
    var cameraContainer, bottomMenu;

    this.remoteCamera = $('<video>').addClass('camera camera-lg')
      .attr('poster', 'images/webrtc.png').attr('autoplay', true);
    this.localCamera = $('<video>').addClass('camera camera-sm')
      .attr('autoplay', true);

    this.alertManager = $('<div>').hide();
    this.iconPhone = $('<span>').addClass('fa fa-phone');
    this.incomingCallModal = $(modalSelector);

    this.buttonAccept = $('<button>').addClass('btn btn-info btn-circle')
      .append($('<span>').addClass('fa fa-sign-in'))
      .tooltip({
        'title': 'Accept call waiting'
      });
    this.buttonCall = $('<button>').addClass('btn btn-success btn-lg btn-circle')
      .append(this.iconPhone)
      .tooltip({
        'title': function title() {
          if ($(this).hasClass('btn-success')) {
            return 'Call';
          } else {
            return 'End call';
          }
        }
      });
    this.buttonShow = $('<button>').addClass('btn btn-info btn-circle')
      .append($('<span>').addClass('fa fa-camera'))
      .tooltip({
        'title': function title() {
          if ($(this).hasClass('active')) {
            return 'Hide small screen';
          } else {
            return 'Show small screen';
          }
        }
      });

    bottomMenu = $('<div>').addClass('bottom-menu')
      .append(this.buttonAccept, this.buttonCall, this.buttonShow).hide();
    cameraContainer = $(containerSelector)
      .append(this.remoteCamera, this.localCamera, this.alertManager, bottomMenu);

    initHandlerGroup.call(this, cameraContainer, bottomMenu);
    updateState.call(this, state.UNREGISTERED);

    this.serverURL = 'ws://130.206.81.33:8080/call';

    var flag = false;

    if (flag) {
      this.username = 'b/kurento';
      this.peername = 'j/kurento';
    } else {
      this.peername = 'b/kurento';
      this.username = 'j/kurento';
    }

    this.reconnect();
  };

  Widget.prototype = {

    'answerIncomingCall': function answerIncomingCall() {
      if (!this.callAccepted) {
        sendMessage.call(this, {
          id : 'incomingCallResponse',
          from : this.callername,
          callResponse : 'reject',
          message : 'call-rejected'
        });
        this.dispose();
      } else {
        showResponse.call(this, 'info', 'You are accepted the incoming call');
        updateState.call(this, state.CALLING);
        this.connection = kurentoUtils.WebRtcPeer.startSendRecv(this.localCamera[0], this.remoteCamera[0],
        function (sdp, wp) {
          sendMessage.call(this, {
            id: 'incomingCallResponse',
            from: this.callername,
            callResponse: 'accept',
            sdpOffer: sdp
          });
          showResponse.call(this, 'info', 'Connection was establish successfully');
        }.bind(this),
        function (error) {
          alert('TODO');
        });
      }

      return this;
    },

    'callUser': function callUser() {
      if (!this.peername.length) {
        showResponse.call(this, 'warning', 'No user for calling.');
        return this;
      }

      updateState.call(this, state.CALLING);
      kurentoUtils.WebRtcPeer.startSendRecv(this.localCamera[0], this.remoteCamera[0],
        function(offerSdp, wp) {
          this.connection = wp;
          sendMessage.call(this, {
            'id': 'call',
            'from': this.username,
            'to': this.peername,
            'sdpOffer': offerSdp
          });
        }.bind(this),
        function (error) {
          alert('TODO');
        });

      return this;
    },

    'close': function close() {
      if (this.server) {
        this.server.close();
        delete this.server;
      }

      return this;
    },

    'dispose': function dispose() {
      if (this.connection) {
        this.connection.dispose();
        delete this.connection;
      }

      return this;
    },

    'endCall': function endCall(data) {
      if (data) {
        showResponse.call(this, 'warning', "User <strong>" + this.peername + "</strong> ended the call");
      } else {
        if (this.currentState == state.BUSY_LINE) {
          showResponse.call(this, 'info', "Call ended successfully");
          sendMessage.call(this, {
            id : 'stop'
          });
        }
      }

      updateState.call(this, state.REGISTERED);
      this.dispose();

      return this;
    },

    'establishCall': function establishCall(data) {
      updateState.call(this, state.BUSY_LINE);
      this.connection.processSdpAnswer(data.sdpAnswer);
    },

    'handleCallResponse': function handleCallResponse(data) {
      switch (data.response) {
        case 'accepted':
          showResponse.call(this, 'info', "User <strong>" + this.peername + "</strong> accepted your call");
          updateState.call(this, state.BUSY_LINE);
          this.connection.processSdpAnswer(data.sdpAnswer);
          break;
        default:
          this.dispose();
          if (data.message == 'user declined') {
            showResponse.call(this, 'warning', "User <strong>" + this.peername + "</strong> rejected your call");
          } else {
            showResponse.call(this, 'warning', "User <strong>" + this.peername + "</strong> is not registered");
          }
          updateState.call(this, state.REGISTERED);
      }

      return this;
    },

    'handleIncomingCall': function handleIncomingCall(data) {
      if (this.currentState == state.BUSY_LINE) {
        sendMessage.call(this, {
          id : 'incomingCallResponse',
          from : data.from,
          callResponse : 'reject',
          message : 'busy'
        });
      } else {
        this.callAccepted = false;
        this.callername = data.from;

        $('#incoming-user').text(this.callername);
        this.incomingCallModal.modal('show');
      }

      return this;
    },

    'handleRegistrationResponse': function handleRegistrationResponse(data) {
      switch (data.response) {
        case 'accepted':
          showResponse.call(this, 'info', 'You have registered successfully');
          updateState.call(this, state.REGISTERED);
          break;
        default:
          showResponse.call(this, 'warning', 'User <strong>' + this.username + '</strong> is already in use.');
          updateState.call(this, state.UNREGISTERED);
      }

      return this;
    },

    'reconnect': function reconnect() {
      this.close();

      this.server = new WebSocket(this.serverURL);
      this.server.onopen = this.registerUser.bind(this);
      this.server.onmessage = handleMessage.bind(this);

      return this;
    },

    'registerUser': function registerUser() {
      updateState.call(this, state.UNREGISTERED);
      sendMessage.call(this, {
        'id': 'register',
        'name': this.username
      });

      return this;
    }

  };

  var handleMessage = function handleMessage(receivedMessage) {
    var data = JSON.parse(receivedMessage.data);

    switch (data.id) {
      case 'registerResponse':
        this.handleRegistrationResponse(data);
        break;
      case 'callResponse':
        this.handleCallResponse(data);
        break;
      case 'incomingCall':
        this.handleIncomingCall(data);
        break;
      case 'startCommunication':
        this.establishCall(data);
        break;
      case 'stopCommunication':
        this.endCall(data);
        break;
      default:
        alert('TODO');
    }

    return this;
  };

  var initHandlerGroup = function initHandlerGroup(cameraContainer, bottomMenu) {
    this.buttonCall.on('click', function (event) {
      if (this.buttonCall.hasClass('btn-success')) {
        this.callUser();
      } else {
        this.endCall();
      }
    }.bind(this));

    this.buttonShow.on('click', function (event) {
      if (this.buttonShow.hasClass('active')) {
        this.buttonShow.removeClass('active');
        this.localCamera.fadeOut();
      } else {
        this.buttonShow.addClass('active');
        this.localCamera.fadeIn();
      }
    }.bind(this));

    cameraContainer
      .on('mouseenter', function (event) {
        bottomMenu.fadeIn();
      })
      .on('mouseleave', function (event) {
        bottomMenu.fadeOut();
      });

    this.incomingCallModal.find('#accept-call').on('click', function (event) {
      this.callAccepted = true;
      this.incomingCallModal.modal('hide');
    }.bind(this));

    this.incomingCallModal.on('hidden.bs.modal', function (event) {
      this.answerIncomingCall();
    }.bind(this));

    return this;
  };

  var sendMessage = function sendMessage(data) {
    this.server.send(JSON.stringify(data));

    return this;
  };

  var showResponse = function showResponse(type, response) {
    this.alertManager
      .removeClass().addClass('alert alert-' + type)
      .empty().append(response)
      .fadeIn(400).delay(900).slideUp(400);

    return this;
  };

  var state = {'BUSY_LINE': 0, 'CALLING': 1, 'REGISTERED': 2, 'UNREGISTERED': 3};

  var updateState = function updateState(newState) {
    switch (newState) {
      case state.BUSY_LINE:
        this.buttonCall.attr('disabled', false);
        this.buttonShow.attr('disabled', false);
        this.remoteCamera.attr('poster', 'images/webrtc.png');
        this.remoteCamera.css({
          'background': ''
        });
        break;
      case state.CALLING:
        this.buttonCall
          .removeClass('btn-success')
          .addClass('btn-danger');
        this.iconPhone
          .removeClass('fa-phone')
          .addClass('fa-tty');
        this.remoteCamera.attr('poster', 'images/transparent-1px.png');
        this.remoteCamera.css({
          'background': 'center transparent url("images/spinner.gif") no-repeat'
        });
        break;
      case state.REGISTERED:
        this.buttonCall.attr('disabled', false);
        this.buttonShow.removeClass('active').attr('disabled', true);
        this.localCamera.hide();
        this.remoteCamera.attr('src', '');
        this.localCamera.attr('src', '');
        this.remoteCamera.attr('poster', 'images/webrtc.png');
        this.remoteCamera.css({
          'background': ''
        });
        this.buttonCall
          .removeClass('btn-danger')
          .addClass('btn-success');
        this.iconPhone
          .removeClass('fa-tty')
          .addClass('fa-phone');
        break;
      case state.UNREGISTERED:
        this.buttonAccept.attr('disabled', true);
        this.buttonCall.attr('disabled', true);
        this.buttonShow.attr('disabled', true);
        this.localCamera.hide();
        break;
      default:
        return this;
    }

    this.currentState = newState;

    return this;
  };

  return Widget;

})();

$(function () {

  var wgt = new Widget('#camera-container', '#incoming-modal');

  $(window).on('beforeunload', function () {
    wgt.close();
  });

});
