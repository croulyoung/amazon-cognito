/*
 * Chat bot interface Jquery Plugin
 *
 * Copyright (c) 2017 Romary Dupuis
 */
 (function ($) {

  $.fn.lifoidchat = function(options) {

    var lifoid = null;

    var recordClickCounter = 0;
      
    var stream;
      
    var recorder;
    
    var console_error = function(message) {
      if(typeof console !== "undefined" && typeof console.error !== "undefined") {
        console.error('LifoidChat [ERROR]: ' + message);
      }
    };

    var console_debug = function(message) {
      if(options.debug && typeof console !== "undefined" && typeof console.error !== "undefined") {
        console.debug('LifoidChat [DEBUG]: ' + message);
      }
    };

    var auth = function(authData) {
      var cognito = new AWSCognito.CognitoIdentityServiceProvider.CognitoAuth(authData);
      cognito.userhandler = {
        onSuccess: function() { console_debug('session open'); },
        onFailure: console_error
        };
      cognito.getSession();
      return cognito;
    }; 

    var data_from_session = function(callback) {
      if (!options.auth) {
        return callback({
          lang: options.lang,
          url: options.url,
          id: options.user_id,
          username: options.username,
          access_token: options.access_token
        })
      }
      session = auth(options.authData);
      var user = {
        lang: options.lang,
        url: options.url,
        id: session.username,
        username: session.username,
        access_token: session.signInUserSession.accessToken.jwtToken
      };
      return callback(user);
    };

    var userid_from_data = function(data) {
      return data.userId;
    };

    var Chat = function($target, options) {

      var defaults = {
        debug: false,
        data_from_session: data_from_session,
        userid_from_data: userid_from_data,
      };

      if(typeof options == 'object') {
        options = $.extend(defaults, options);
      } else {
        options = defaults;
      }

      var $tpl = $('\
          <div class="panel panel-inverse"> \
            <div class="panel-body" data-scrollbar="true" data-height="100%" style="padding-bottom:40px;"> \
              <ul class="chats"></ul> \
            </div> \
          </div>');

      var me = null;
      var users = {};

      var $chat = $tpl.find('.chats').eq(0);

      var get_latest = function() {
        return $chat.children().last().prop('date');
      };

      var now = function () {
        var dNow = new Date();
        return dNow.toISOString().substr(0, 19) + '.' + dNow.getUTCMilliseconds(); 
      };

      var LIFOID = function(user, lifoidId) {
      
        var self = this;
        self.lang = user.lang;
        self.url = user.url;
        self.access_token = user.access_token;
        self.username = user.username;
        self.lifoid_id = lifoidId
        self.load = function(to_date, callback, error) {
          /* 
           * Get 100 items older than to_date
           * */
          $.ajax({
            type: 'POST',
            crossDomain: true,
            url: self.url + '/messages',
            data: JSON.stringify({
              lifoid_id: self.lifoid_id,
              lang: self.lang,
              access_token: self.access_token,
              to_date: to_date,
              user: {username: self.username}
            }),
            contentType: 'application/json',
            dataType: 'json'
          }).done(function(data) {
            callback(data);
          })
          .fail(function(jqXHR, textStatus){
            if (jqXHR.status == 403) {
              console.log(options.expiredUrl);
              window.location.href = options.expiredUrl;
              //options.data_from_session(init);
            }
            error('Cannot fetch Lifoid server');
          });
        };

        self.subscribe = function(from_date, incoming, error) {
          /*
           * Get 100 items more recent than from_date
           * We try until we get something.
           */
          setTimeout(function() {
            // Call Lifoid endpoint
              $.ajax({
                type: 'POST',
                crossDomain: true,
                url: self.url + '/messages',
                data: JSON.stringify({
                  lifoid_id: self.lifoid_id,
                  access_token: self.access_token,
                  from_date: from_date,
                  user: {username: self.username}
                }),
                contentType: 'application/json',
                dataType: 'json'
              }).done(function(data) {
                if (data.length > 0)
                  incoming(data);
                else
                  self.subscribe(from_date, incoming, error);
              })
              .fail(function(jqXHR, textStatus){
                if (jqXHR.status == 403) {
                  window.location.href = options.expiredUrl;
                  // options.data_from_session(init);
                }
                error('Cannot fetch Lifoid server');
              });
          }, 500); 
        };
        
        self.publish = function(message, incoming, error) {
            $.ajax({
              type: 'POST',
              crossDomain: true,
              url: self.url + '/webhook',
              data: JSON.stringify(message),
              contentType: 'application/json',
            }).done(function(date) {
              // TODO: show that message has been successfully sent
              var from = date;
              self.subscribe(
                from,
                incoming,
                error
              );
            })
          .fail(function(jqXHR, textStatus){
                if (jqXHR.status == 403) {
                  window.location.href = options.expiredUrl;
                  //options.data_from_session(init);
                }
              error('Cannot fetch Lifoid server');
              setTimeout(function() {
                // TODO: we should give up at some point ...
                self.publish(message, incoming, error);
              }, 10000);
            });
        };

        return self;
      }
      
      var Message = function(type, username, date, content, lifoid, color) {

        var self = this;
        self.$tpl = '';
        // TODO: deal with different types  of messages here, e.g. quick replies
        if(type == "message") {
          self.$tpl = $('\
              <li class="right"> \
                <a href="javascript:;" class="image"><img alt="" src="" /></a> \
                <div class="message"> \
                  <a href="javascript:;" class="name"></a> \
                  <span class="text"></span> \
                  <span class="date-time">11:23pm</span> \
                </div> \
             </li>');
          if (lifoid) {
            if (content.attachments != null) {
              for (i = 0; i< content.attachments.length; i++) {
                if (content.attachments[i].file_url != null) {
                  self.$tpl.append('<a href="'+ content.attachments[i].file_url  +
                    '" target="_blank" class="btn btn-primary m-t-5" style="margin-left:70px;">'+content.attachments[i].text+'</a>');
                }
                if (content.attachments[i].actions != null) {
                  // ButtonAction and MenuAction
                  if (content.attachments[i].actions[0].name == 'menu_select') {
                    for (j = 0; j < content.attachments[i].actions.length; j++) {
                      self.$tpl.append('<form class="form-input-flat m-t-5"></form>');
                      self.$tpl
                        .find('.form-input-flat')
                        .append('<div class="form-group row" style="margin-left:70px;">'+
                            '<select class="form-control col-sm-4 lifoid-ms">'+
                            '<option value="">Please select an option</option></select>'+
                            '</div>');
                      for (k=0; k < content.attachments[i].actions[j].options.length; k++) {
                        self.$tpl.find('.form-control').append('<option value="'+
                          content.attachments[i].actions[j].options[k].value+'">'+
                          content.attachments[i].actions[j].options[k].text+
                          '</option>');
                      }
                    }
                  }
                  else {
                    self.$tpl.append('<div class="btn-group m-t-5" style="margin-left:70px;"></div>');
                    for (j = 0; j < content.attachments[i].actions.length; j++) {
                      self.$tpl
                        .find('.btn-group')
                        .append('<button type="button" class="btn btn-primary lifoid-qr" data-value="'+
                            content.attachments[i].actions[j].value+'">' +
                            content.attachments[i].actions[j].name  + '</button>');
                    }
                  }
                }
                if (content.attachments[i].table != null) {
                  // Table
                  self.$attachment = $('\
                      <div class="panel panel-info m-t-5">\
                        <div class="panel-heading">\
                        <h4 class="panel-title">'+ content.attachments[i].table.title +'</h4>\
                        </div>\
                        <div class="table-responsive">\
                          <table class="table table-striped lifoid-edit-table" data-name="'+
                          content.attachments[i].table.name +'" data-columns="'+ content.attachments[i].table.columns.join() +
                          '" data-types="'+ content.attachments[i].table.types.join() +
                          '" data-rows=\''+ JSON.stringify(content.attachments[i].table.rows) +
                          '\' data-title="'+ content.attachments[i].table.title +'" style="margin-bottom:4px;">\
                            <thead><tr class="info"><th></th></tr></thead>\
                            <tbody>\
                            </tbody>\
                          </table>\
                        </div>\
                      </div>\
                      ');
                  for (j=0; j < content.attachments[i].table.columns.length; j++) {
                    self.$attachment.find('thead > tr').append('<th class="text-center">' +
                        content.attachments[i].table.columns[j]  +'</th>');
                  }
                  for (j=0; j < content.attachments[i].table.rows.length; j++) {
                    self.$attachment.find('tbody').append('<tr><td class="text-center"><button class="btn btn-xs btn-danger" type="button"><i class="fa fa-minus"></i></button></td></tr>');
                    for (k=0; k < content.attachments[i].table.columns.length; k++) {
                      column = content.attachments[i].table.columns[k];
                      if (content.attachments[i].table.types[k] == 'Date') {
                        self.$attachment.find('tbody > tr:last').append('\
                          <td data-value="'+moment().format('MM/DD/YYYY')+'">\
                          <input class="daterange-singledate form-control" type="text" name="'+column+'" value="'+moment().format('MM/DD/YYYY')+'" />\
                          </td>\
                          ');
                      }
                      else
                        self.$attachment.find('tbody > tr:last').append('<td>'+
                          content.attachments[i].table.rows[j][column] +
                          '</td>');
                    }
                  }
                  self.$attachment_btn = $('\
                      <div class="btn-group m-t-5">\
                        <button class="btn btn-primary add-row btn-sm" type="button"><i class="fa fa-plus"></i></button>\
                        <button class="btn btn-primary send-table btn-sm" type="button"><i class="fa fa-send"></i></button>\
                      </div>\
                      ');
                  self.$tpl.append(self.$attachment);
                  self.$tpl.append(self.$attachment_btn);
                  self.$tpl.find('table').editableTableWidget({
                    editor: $('<input class="table-input">')
                  });
                  self.$tpl.find('.daterange-singledate').each(function() {
                    var _this = this;
                    $(this).daterangepicker(
                      {
                        start: moment(),
                        singleDatePicker: true,
                        showDropdowns: true,
                        drops: 'up',
                        locale: {
                          format: 'MM/DD/YYYY'
                        }
                      }, 
                      function(start, end, label) {
                        selected_date = start.format('MM/DD/YYYY');
                        _this.value = selected_date;
                        $(_this.parentNode).attr('data-value', selected_date);
                      }
                    );
                  });
                  self.$tpl.on('click', '.btn-danger', function(){
                   this.parentNode.parentNode.remove(); 
                  });
                  self.$tpl.on('click', '.add-row', function(){
                    var table = $chat.find('.lifoid-edit-table');
                    var types = table.attr('data-types').split(',');
                    var columns = table.attr('data-columns').split(',');
                    var rows = JSON.parse(table.attr('data-rows'));
                    table.find('tbody').append('<tr><td class="text-center"><button class="btn btn-xs btn-danger" type="button"><i class="fa fa-minus"></i></button></td></tr>');
                    for (k=0; k < types.length; k++) {
                      column = columns[k];
                      if (types[k] == 'Date') {
                        table.find('tbody > tr:last').append('\
                          <td data-value="'+moment().format('MM/DD/YYYY')+'">\
                          <input class="daterange-singledate form-control" type="text" name="'+column+'" value="'+moment().format('MM/DD/YYYY')+'" />\
                          </td>\
                          ');
                      }
                      else
                        table.find('tbody > tr:last').append('<td>'+rows[0][column]+'</td>');
                    }
                    table.editableTableWidget({
                      editor: $('<input class="table-input">')
                    });
                    table.find('.daterange-singledate').each(function() {
                      var _this = this;
                      $(this).daterangepicker(
                        {
                          start: moment(),
                          singleDatePicker: true,
                          showDropdowns: true,
                          drops: 'up',
                          locale: {
                            format: 'MM/DD/YYYY'
                          }
                        }, 
                        function(start, end, label) {
                          selected_date = start.format('MM/DD/YYYY');
                          _this.value = selected_date;
                          $(_this.parentNode).attr('data-value', selected_date);
                        }
                      );
                    });
                  });
                }
              }
            }
            self.$tpl.addClass('left').removeClass('right');
            self.$tpl.find('img').attr('src', options.lifoidAvatar);
          }
          else {
            self.$tpl.find('img').attr('letters', 'Me');
            if (content.attachments != null) {
              for (i = 0; i< content.attachments.length; i++) {
                if (content.attachments[i].table != null) {
                  // Table
                  self.$attachment = $('\
                    <div class="panel panel-info m-t-5">\
                      <div class="panel-heading">\
                      <h4 class="panel-title">'+ content.attachments[i].table.title +'</h4>\
                      </div>\
                      <div class="table-responsive">\
                        <table class="table table-striped">\
                          <thead><tr class="info"></tr></thead>\
                          <tbody></tbody>\
                        </table>\
                      </div>\
                    </div>\
                      ');
                  for (j=0; j < content.attachments[i].table.columns.length; j++) {
                    self.$attachment.find('thead > tr').append('<th class="text-center">' +
                        content.attachments[i].table.columns[j]  +'</th>');
                  }
                  for (j=0; j < content.attachments[i].table.rows.length; j++) {
                    self.$attachment.find('tbody').append('<tr></tr>');
                    for (k=0; k < content.attachments[i].table.columns.length; k++) {
                      column = content.attachments[i].table.columns[k];
                      self.$attachment.find('tbody > tr:last').append('<td>'+
                          content.attachments[i].table.rows[j][column] +
                          '</td>');
                    }
                  }
                  self.$tpl.append(self.$attachment); 
                } 
              } 
            }
          }
          if (username.indexOf('Google') != -1 || username.length == 32) {
            self.$tpl.find('.name').text('me').html(); // escape html
          }
          else
            self.$tpl.find('.name').text(username).html(); // escape html
          self.$tpl.find('.text').text(content.text).html(); // escape html
          self.$tpl.find('.date-time').text(prettyDate(date)).html(); //escape html
          self.$tpl.prop('date', date);
        }
        $chat.append(self.$tpl);
        generateAvatars(color);
      };

      var User = function(id, username, color) {

        var self = this;

        self.id = id;
        
        self.username = username;

        self.color = color;

        self.chat = function(content, date) {
          return new Message('message', self.username, date, content,
                      self.id == options.lifoidId, self.color);
        };
        return self;
      };

      var init = function(me) {
        // Add two users: myself and Lifoid
        users[me.id] = new User(me.id, me.username, options.color);
        users[options.lifoidId] = new User(options.lifoidId, 
                                           options.lifoidName,
                                           options.color);
        lifoid = new LIFOID(me, options.lifoidId);
        var to_now = now();
        console_debug('fetch:' + to_now);
        var send_message = function(bot, user, text, attachments) {
          var utcnow = now();
          if (text.indexOf('chatui-open') == -1)
            users[user.id].chat({ text: text, attachments: attachments }, utcnow);
          $("html, body").animate({ scrollTop: $(document).height() }, 100);
          lifoid.publish(
            {
              q: { text: text, attachments: attachments },
              access_token: user.access_token,
              user: {username: user.username},
              lifoid_id: options.lifoidId,
              lang: me.lang
            },
            function(data) {
              for (var i = 0 ; i < data.length; i++) {
                //if ((get_latest() != undefined) && (data[i].date <= get_latest()))
                //  continue;
                var mess = users[data[i].from_user].chat(data[i].payload, data[i].date);
                if (i == (data.length - 1)) {
                  $.ajax({
                      url: me.url + '/speech/chatbot/' + options.lifoidId + '/lang/' + me.lang + "/tts",
                      crossDomain: true,
                      type: "POST",
                      data: JSON.stringify({
                        q: { text: data[i].payload.text },
                        access_token: user.access_token,
                        lifoid_id: options.lifoidId,
                       user: {username: user.username}
                      }),
                      contentType: false,
                      processData: false,
                      success: function(resp) {
                        function _base64ToArrayBuffer(base64) {
                            var binary_string =  window.atob(base64);
                            var len = binary_string.length;
                            var bytes = new Uint8Array( len );
                            for (var i = 0; i < len; i++)        {
                                bytes[i] = binary_string.charCodeAt(i);
                            }
                            return bytes;
                        }

                        var audioElement = document.createElement('audio');
                        //audioElement.autoplay = true;
                       // audioElement.controls = true;
                        audioElement.autoplay = true;
                        var uInt8Array = _base64ToArrayBuffer(resp.audio);
                        var arrayBuffer = uInt8Array.buffer;
                        var blob = new Blob([arrayBuffer], {type: 'audio/mpeg'});
                        var url = URL.createObjectURL(blob);

                        audioElement.src = url;

                        audioElement.addEventListener('ended', function () {
                          audioElement.currentTime = 0;
                          if (typeof callback === 'function') {
                            console.log('audio playback ended');
                          }
                        });
                        $chat.children().last().find('.message').append(audioElement);
                        console.log(audioElement);
                        //audioElement.play();
                      }
                    });
                }
              }
              $("html, body").animate({ scrollTop: $(document).height() }, 100);
            },
            console_error
          );
        };
        $('.chatitem').click(function() {
          console.log('chatitem');
          send_message(lifoid, me, $(this).html());
        });
        $chat.on('click', '.lifoid-qr', function(){
          valueSelected = $(this).attr('data-value');
          this.parentNode.remove();
          //$('.lifoid-qr').remove();
          send_message(lifoid, me, valueSelected);
        });
        $chat.on('change', '.lifoid-ms', function(){
          var optionSelected = $("option:selected", this);
          var valueSelected = this.value;
          $('.lifoid-ms').remove();
          send_message(lifoid, me, valueSelected);
        });
        $chat.on('click', '.send-table', function(){
          var table = $chat.find('.lifoid-edit-table');
          var json_table = table.tableToJSON({
            ignoreColumns: [0],
            textDataOverride: 'data-value'
          });
          send_message(lifoid, me, table.attr('data-title'),
             [{ table: { title: table.attr('data-title'), name: table.attr('data-name'),
               rows: json_table, columns: table.attr('data-columns').split(',') } }]);
          $chat.find('.panel').remove();
          table.remove();
          this.parentNode.remove();
        });
        $chat.on('validate', 'table td', function(evt, value){
          var cell = $(this),
              column = cell.index(),
              table = $chat.find('.lifoid-edit-table'),
              types = table.attr('data-types').split(',');
          if (types[column - 1] === 'Numeric') {
            return !isNaN(parseFloat(value)) && isFinite(value);
          }
          return !!value && value.trim().length > 0;
        });
        $target.empty().append($tpl);

        $('#' + options.textFormId).submit(function() {
          var $text = $('input[type="text"]');
          if($text.val()) {
            send_message(lifoid, me, $text.val());
            $text.val('');
            $('.lifoid-ms').remove();
            $('.lifoid-qr').remove();
          }
          return false;
        });

        /******  Speech experimentation  ******/
        //$(this).ajaxStart(function() { NProgress.start() });
        //$(this).ajaxStop(function() { NProgress.done() });

        // start/stop recording every other time the button is clicked
        $("#record").click(function() {
          if(recordClickCounter++ % 2 == 0) {

            // user started recording, restyle into 'stop' button
            $(this).removeClass("btn-primary");
            $(this).addClass("btn-danger");

            // set up audio recorder and connect to backend service
            navigator.getUserMedia_ = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
            navigator.getUserMedia_({audio: true}, 

              function(innerStream) {
                stream = innerStream;
                recorder = new MediaStreamRecorder(stream);
      
                // todo: probably room for optimizations (ideally convert to flac)
                recorder.mimeType = "audio/wav";
                recorder.sampleRate = 44100;
                recorder.audioChannels = 1;
      
                // this event is fired whenever time's up or stop() is called
                recorder.ondataavailable = function(audio) {
      
                  // wrap audio blob in form data in order to post it to backend
                  var form = new FormData();
                  form.append("file", audio);
                  form.append("data", JSON.stringify({
                    access_token: me.access_token,
                    lifoid_id: options.lifoidId,
                    user: {username: me.username}
                  }));
                  // Stop recorder
                  this.stop();
                  // post audio blob to backend
                  $.ajax({
                    url: me.url + '/speech/chatbot/' + options.lifoidId + '/lang/' + me.lang + "/stt",
                    crossDomain: true,
                    type: "POST",
                    data: form,
                    contentType: false,
                    processData: false,
                    success: function(resp) {
                      // todo: implement proper error handling
                      var transcript;
                      try {
                        transcript = resp.results[0].alternatives[0].transcript;
                      } catch(error) {
                        transcript = "\"\"";
                      }

                      console.log(JSON.stringify(resp, null, 2));
                      send_message(lifoid, me, transcript);
                    }
                  });
                };

                // start the actual recording, run for 60 secs max
                recorder.start(6000);
              },

              function(e) {
                console.error("Couldn't connect to user's audio input", e);
              }

            );

          } else {

            // user stopped recording, restyle into 'start' button
            $(this).removeClass("btn-danger");
            $(this).addClass("btn-primary");

            // kill recording and stop hogging user's microphone
            recorder.stop();
            stream.stop();

          }

        });
        /****** End speech experimentation  ******/

        lifoid.load(
          to_now, 
          function(data) {
            for (var i = data.length - 1 ; i >= 0; i--) {
              if ((get_latest() != undefined) && (data[i].date <= get_latest()))
                continue;
              if (data[i].payload.attachments != null) {
                // We display only table attachments
                for (j = 0; j < data[i].payload.attachments.length; j++) {
                  if ('table' in data[i].payload.attachments[j] && data[i].from_user != options.lifoidId)
                    continue
                  data[i].payload.attachments.splice(j, 1);
                }
                users[data[i].from_user].chat(data[i].payload, data[i].date);
              }
              else {
                if (data[i].payload.text.indexOf('chatui-open') == -1)
                  users[data[i].from_user].chat(data[i].payload, data[i].date);
              }
            }
            $("html, body").animate({ scrollTop: $(document).height() }, 100);
            send_message(lifoid, me, 'chatui-open');
          },
          console_error
        );
      };
      options.data_from_session(init);
    };

    var a_chat = new Chat(this, options);
    return this;
  };

}(jQuery));
