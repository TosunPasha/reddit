!function(r) {

var UseDefaultClassName = (function() {
  var camelCaseRegex = /([a-z])([A-Z])/g;
  function hyphenate(match, $1, $2) {
    return $1 + '-' + $2;
  }

  return {
    /**
     * derive a className automatically from the displayName property
     * e.g. MyDisplayName => my-display-name
     * if a className state or prop is passed in, add that
     * if values are passed into the function, add those in as well
     * @param {string} arguments optionally pass in any number of
     *                           classNames to to add to the list
     * @return {string} css class name
     */
    getClassName: function(/* classNames */) {
      var classNames = [];

      if (this.constructor.displayName) {
        classNames.push(
          this.constructor.displayName.replace(camelCaseRegex, hyphenate)
                                      .toLowerCase()
          );
      }

      if (this.state && this.state.className) {
        classNames.push(this.state.className);
      }
      else if (this.props.className) {
        classNames.push(this.props.className);
      }

      if (arguments.length) {
        classNames.push.apply(classNames, arguments);
      }

      return classNames.join(' ');
    }
  };
})();


var CampaignFormattedProps = {
  componentWillMount: function() {
    this.formattedProps = this.getFormattedProps(_.clone(this.props), this.props);
  },

  componentWillUpdate: function(nextProps) {
    this.formattedProps = this.getFormattedProps(_.clone(nextProps), nextProps);
  },

  getFormattedProps: function(formattedProps, props) {
    if (props.impressions) {
      formattedProps.impressions = r.utils.prettyNumber(props.impressions);
    }
    if (props.bid === null) {
      formattedProps.bid = 'N/A';
    } else if (props.bid) {
      formattedProps.bid = props.bid.toFixed(2);
    }
    return formattedProps;
  },
};


var CampaignButton = React.createClass({
  displayName: 'CampaignButton',

  mixins: [UseDefaultClassName],

  getDefaultProps: function() {
    return {
      isNew: true,
    };
  },

  render: function() {
    if (this.props.isNew) {
      return React.DOM.div({ className: 'button-group' },
        React.DOM.button(
          { ref: 'keepOpen', className: 'campaign-button', onClick: this.handleClick },
          r._('create')
        ),
        React.DOM.button(
          { className: this.getClassName(), onClick: this.handleClick },
          r._('+ close')
        ) 
      );
    }
    return React.DOM.button(
      { className: this.getClassName(), onClick: this.handleClick },
      this.props.isNew ? r._('create') : r._('save')
    );
  },

  handleClick: function(e) {
    var close = true;
    if (this.refs.keepOpen) {
      close = !(e.target === this.refs.keepOpen.getDOMNode());
    }
    if (typeof this.props.onClick === 'function') {
      this.props.onClick(close);
    }
  },
});


var InfoText = React.createClass({
  displayName: 'InfoText',

  mixins: [UseDefaultClassName, CampaignFormattedProps],

  render: function() {
    var text = Array.isArray(this.props.children)
             ? this.props.children.join('\n')
             : this.props.children;
    return React.DOM.span({ className: this.getClassName() },
      text.format(this.formattedProps)
    );
  },

});

var CampaignOptionTable = React.createClass({
  displayName: 'CampaignOptionTable',

  mixins: [UseDefaultClassName],

  render: function() {
    return React.DOM.table({ className: this.getClassName() },
      React.DOM.tbody(null, this.props.children)
    );
  }
})

var CampaignOption = React.createClass({
  displayName: 'CampaignOption',

  mixins: [UseDefaultClassName, CampaignFormattedProps],

  getDefaultProps: function() {
    return {
      primary: false,
      start: '',
      end: '',
      bid: '',
      impressions: '',
      isNew: true,
    };
  },

  render: function() {
    return React.DOM.tr({ className: this.getClassName() },
      React.DOM.td({ className: 'date start-date' }, this.props.start),
      React.DOM.td({ className: 'date end-date' }, this.props.end),
      React.DOM.td({ className: 'bid' }, '$', this.formattedProps.bid),
      React.DOM.td({ className: 'impressions' },
        this.formattedProps.impressions, ' impressions'
      ),
      React.DOM.td({ className: 'buttons' },
        CampaignButton({
          className: this.props.primary ? 'primary-button' : '',
          isNew: this.props.isNew,
          onClick: this.handleClick,
        })
      )
    );
  },

  handleClick: function(close) {
    var $startdate = $('#startdate');
    var $enddate = $('#enddate');
    var $bid = $('#bid');
    var userStartdate = $startdate.val();
    var userEnddate = $enddate.val();
    var userBid = $bid.val();
    $('#startdate').val(this.props.start);
    $('#enddate').val(this.props.end);
    $('#bid').val(this.props.bid);
    setTimeout(function(){
      send_campaign(close);
      // hack, needed because post_pseudo_form hides any element in the form
      // with an `error` class, which might be one of our InfoText components
      // but we want react to manage that
      $('.campaign-creator .info-text').removeAttr('style');
      // reset the form with the user's original values
      $startdate.val(userStartdate);
      $enddate.val(userEnddate);
      $bid.val(userBid);
    }, 0);
  },
});


var CampaignSet = React.createClass({
  displayName: 'CampaignSet',

  mixins: [UseDefaultClassName],

  render: function() {
    return React.DOM.div({ className: this.getClassName() },
      this.props.children
    );
  },
});


var CampaignCreator = React.createClass({
  displayName: 'CampaignCreator',

  mixins: [UseDefaultClassName],

  getDefaultProps: function() {
    return {
      bid: 0,
      targetName: '',
      cpm: 0,
      maxValidBid: 0,
      minValidBid: 0,
      dates: [],
      inventory: [],
      requested: 0,
      override: false,
      isNew: true,
    };
  },

  getInitialState: function() {
    var totalAvailable = this.getAvailable(this.props);
    var available = totalAvailable;
    if (this.props.maxValidBid) {
      available = Math.min(available, this.getImpressions(this.props.maxValidBid));
    }
    return {
      totalAvailable: totalAvailable,
      available: available,
      maxTime: 0,
    };
  },

  componentWillMount: function() {
    this.setState({
      maxTime: dateFromInput('#date-start-max').getTime(),
    });
  },

  componentWillReceiveProps: function(nextProps) {
    var totalAvailable = this.getAvailable(nextProps);
    var available = totalAvailable;
    if (this.props.maxValidBid) {
      available = Math.min(available, this.getImpressions(this.props.maxValidBid));
    }
    this.setState({
      totalAvailable: totalAvailable,
      available: available,
    });
  },

  getAvailable: function(props) {
    if (props.override) {
      return _.reduce(props.inventory, sum, 0);
    }
    else {
      return _.min(props.inventory) * props.dates.length;
    }
  },

  render: function() {
    return React.DOM.div({
        className: this.getClassName(),
      },
      this.getCampaignSets()
    );
  },

  getCampaignSets: function() {
    var requested = this.getRequestedOption();
    requested.primary = true;
    var maximized = this.getMaximizedOption();
    if (this.props.override) {
      if (requested.impressions <= this.state.available) {
        return [CampaignSet(null,
            InfoText(null, r._('the campaign you requested is available!')),
            CampaignOptionTable(null, CampaignOption(requested))
          ),
          InfoText(maximized,
              r._('the maximum budget available is $%(bid)s (%(impressions)s impressions)')
          )
        ];
      }
      else {
        return CampaignSet(null,
          InfoText({
              className: 'error',
              available: this.state.available,
              target: this.props.targetName
            },
            r._('we expect to only have %(available)s impressions on %(target)s. ' +
                 'we may not fully deliver.')
          ),
          CampaignOptionTable(null, CampaignOption(requested))
        );
      }
    }
    else if (requested.bid >= this.props.minValidBid &&
             requested.impressions <= this.state.available) {
      var result = CampaignSet(null,
        InfoText(null, r._('the campaign you requested is available!')),
        CampaignOptionTable(null, CampaignOption(requested))
      );
      if (maximized.bid > requested.bid &&
          requested.bid * 1.2 >= maximized.bid &&
          this.state.available === this.state.totalAvailable) {
        var difference = maximized.bid - requested.bid;
        result = [result, CampaignSet(null,
          InfoText({ difference: difference.toFixed(2) },
            r._('want to maximize your campaign? for only $%(difference)s more ' +
                 'you can buy all available inventory for your selected dates!')
          ),
          CampaignOptionTable(null, CampaignOption(maximized))
        )];
      }
      else {
        result = [result, InfoText(maximized,
          r._('the maximum budget available is $%(bid)s (%(impressions)s impressions)')
        )];
      }
      return result;
    }
    else if (requested.bid < this.props.minValidBid) {
      var minimal = this.getMinimizedOption();
      if (minimal.impressions <= this.state.available) {
        return CampaignSet(null,
          InfoText({ className: 'error' },
            r._('the campaign you requested is too small! this campaign is available:')
          ),
          CampaignOptionTable(null, CampaignOption(minimal))
        );
      }
      else {
        return InfoText({ className: 'error' },
          r._('the campaign you requested is too small!')
        );
      }
    }
    else if (requested.impressions > this.state.available &&
             this.state.totalAvailable > this.state.available &&
             maximized.bid > this.props.minValidBid) {
      return CampaignSet(null,
        InfoText(null, 
          r._('the campaign you requested is too big! the largest campaign ' +
               'available is:')
        ),
        CampaignOptionTable(null, CampaignOption(maximized))
      );
    }
    else if (requested.impressions > this.state.available) {

      var options = [];
      if (maximized.bid >= this.props.minValidBid) {
        options.push(CampaignOption(maximized));
      }
      var reduced = this.getReducedWindowOption();
      if (reduced && reduced.bid >= this.props.minValidBid) {
        if (reduced.impressions > requested.impressions) {
          reduced.impressions = requested.impressions;
          reduced.bid = requested.bid;
        }
        options.push(CampaignOption(reduced));
      }
      if (options.length) {
        return CampaignSet(null,
          InfoText({
              className: 'error',
              target: this.props.targetName,
            },
            r._('we have insufficient available inventory in %(target)s to fulfill ' +
                 'your requested dates. the following campaigns are available:')
          ),
          CampaignOptionTable(null, options)
        );
      }
      else {
        return InfoText({
            className: 'error',
            target: this.props.targetName
          },
          r._('inventory for %(target)s is sold out for your requested dates. ' +
               'please try a different target or different dates.')
        );
      }
    }
    return null;
  },

  formatDate: function(date) {
    return $.datepicker.formatDate('mm/dd/yy', date);
  },

  getBid: function(impressions, requestedBid) {
    if (this.getImpressions(requestedBid) === impressions) {
      return requestedBid; 
    } else {
      return Math.floor((impressions / 1000) * this.props.cpm) / 100;
    }
  },

  getImpressions: function(bid) {
    return Math.floor(bid / this.props.cpm * 1000 * 100);
  },

  getOptionData: function(startDate, duration, impressions, requestedBid) {
    var endDate = new Date();
    endDate.setTime(startDate.getTime());
    endDate.setDate(startDate.getDate() + duration);
    return {
      start: this.formatDate(startDate),
      end: this.formatDate(endDate),
      bid: this.getBid(impressions, requestedBid),
      impressions: Math.floor(impressions),
      isNew: this.props.isNew,
    };
  },

  getRequestedOption: function() {
    return this.getOptionData(
      this.props.dates[0],
      this.props.dates.length,
      this.props.requested,
      this.props.bid
    );
  },

  getMaximizedOption: function() {
    return this.getOptionData(
      this.props.dates[0],
      this.props.dates.length,
      this.state.available,
      this.props.bid
    );
  },

  getMinimizedOption: function() {
    return this.getOptionData(
      this.props.dates[0],
      this.props.dates.length,
      this.getImpressions(this.props.minValidBid),
      this.props.minValidBid
    );
  },

  getReducedWindowOption: function() {
    var days = (1000 * 60 * 60 * 24);
    var maxOffset = (this.state.maxTime - this.props.dates[0].getTime()) / days | 0;
    var res =  r.sponsored.getMaximumRequest(
      this.props.inventory,
      this.getImpressions(this.props.minValidBid),
      this.props.requested,
      maxOffset
    );
    if (res && res.days.length < this.props.dates.length) {
      return this.getOptionData(
        this.props.dates[res.offset],
        res.days.length,
        res.maxRequest,
        this.props.bid
      );
    }
    else {
      return null;
    }
  },
});


var exports = r.sponsored = {
    set_form_render_fnc: function(render) {
        this.render = render;
    },

    render: function() {},

    init: function() {
        $("#sr-autocomplete").on("sr-changed blur", function() {
            r.sponsored.render()
        })
        this.inventory = {}
        this.campaignListColumns = $('.existing-campaigns thead th').length
        $("input[name='media_url_type']").on("change", this.mediaInputChange)
    },

    setup: function(inventory_by_sr, priceDict, isEmpty, userIsSponsor) {
        this.inventory = inventory_by_sr
        this.priceDict = priceDict
        if (isEmpty) {
            this.render()
            init_startdate()
            init_enddate()
            $("#campaign").find("button[name=create]").show().end()
                .find("button[name=save]").hide().end()
        }
        this.userIsSponsor = userIsSponsor
    },

    setup_collection_selector: function() {
        var $collectionSelector = $('.collection-selector');
        var $collectionList = $('.form-group-list');
        var $collections = $collectionList.find('.form-group .label-group');
        var collectionCount = $collections.length;
        var collectionHeight = $collections.eq(0).outerHeight();
        var $subredditList = $('.collection-subreddit-list ul');
        var $collectionLabel = $('.collection-subreddit-list .collection-label');
        var $frontpageLabel = $('.collection-subreddit-list .frontpage-label');

        var subredditNameTemplate = _.template('<% _.each(sr_names, function(name) { %>'
            + ' <li><%= name %></li> <% }); %>');
        var render_subreddit_list = _.bind(function(collection) {
            if (collection === 'none' || 
                    typeof this.collectionsByName[collection] === 'undefined') {
                return '';
            }
            else {
                return subredditNameTemplate(this.collectionsByName[collection]);
            }
        }, this);

        var collapse = _.bind(function() {
            this.collapse_collection_selector();
            this.render();
        }, this);
        
        this.collapse_collection_selector = function collapse_widget() {
            $('body').off('click', collapse);
            var $selected = get_selected();
            var index = $collections.index($selected);
            $collectionSelector.addClass('collapsed').removeClass('expanded');
            $collectionList.innerHeight(collectionHeight)
                .css('top', -collectionHeight * index);
            var val = $collectionList.find('input[type=radio]:checked').val();
            var subredditListItems = render_subreddit_list(val);
            $subredditList.html(subredditListItems);
            if (val === 'none') {
                $collectionLabel.hide();
                $frontpageLabel.show();
            }
            else {
                $collectionLabel.show();
                $frontpageLabel.hide();
            }
        }

        function expand() {
            $('body').on('click', collapse);
            $collectionSelector.addClass('expanded').removeClass('collapsed');
            $collectionList
                .innerHeight(collectionCount * collectionHeight)
                .css('top', 0);
        }

        function get_selected() {
            return $collectionList.find('input[type=radio]:checked')
                .siblings('.label-group')
        }

        $collectionSelector
            .removeClass('uninitialized')
            .on('click', '.label-group', function(e) {
                if ($collectionSelector.is('.collapsed')) {
                    expand();
                }
                else {
                    var $selected = get_selected();
                    if ($selected[0] !== this) {
                        $selected.siblings('input').prop('checked', false);
                        $(this).siblings('input').prop('checked', 'checked');
                    }
                    collapse();
                }
                return false;
            });

        collapse();
    },

    setup_geotargeting: function(regions, metros) {
        this.regions = regions
        this.metros = metros
    },

    setup_collections: function(collections, defaultValue) {
        defaultValue = defaultValue || 'none';

        this.collections = [{
            name: 'none', 
            sr_names: null, 
            description: 'influencers on reddit’s highest trafficking page',
        }].concat(collections || []);

        this.collectionsByName = _.reduce(collections, function(obj, item) {
            if (item.sr_names) {
                item.sr_names = item.sr_names.slice(0, 20);
            }
            obj[item.name] = item;
            return obj;
        }, {});

        var template = _.template('<label class="form-group">'
          + '<input type="radio" name="collection" value="<%= name %>"'
          + '    <% print(name === \'' + defaultValue + '\' ? "checked=\'checked\'" : "") %>/>'
          + '  <div class="label-group">'
          + '    <span class="label"><% print(name === \'none\' ? \'frontpage influencers\' : name) %></span>'
          + '    <small class="description"><%= description %></small>'
          + '  </div>'
          + '</label>');

        var rendered = _.map(this.collections, template).join('');
        $(_.bind(function() {
            $('.collection-selector .form-group-list').html(rendered);
            this.setup_collection_selector();
            this.render_campaign_dashboard_header();
        }, this))
    },

    get_dates: function(startdate, enddate) {
        var start = $.datepicker.parseDate('mm/dd/yy', startdate),
            end = $.datepicker.parseDate('mm/dd/yy', enddate),
            ndays = Math.round((end - start) / (1000 * 60 * 60 * 24)),
            dates = []

        for (var i=0; i < ndays; i++) {
            var d = new Date(start.getTime())
            d.setDate(start.getDate() + i)
            dates.push(d)
        }
        return dates
    },

    get_inventory_key: function(srname, collection, geotarget) {
        var inventoryKey = collection ? '#' + collection : srname
        if (geotarget.country != "") {
            inventoryKey += "/" + geotarget.country
        }
        if (geotarget.metro != "") {
            inventoryKey += "/" + geotarget.metro
        }
        return inventoryKey
    },

    needs_to_fetch_inventory: function(targeting, timing) {
        var dates = timing.dates,
            inventoryKey = targeting.inventoryKey;
        return _.some(dates, function(date) {
            var datestr = $.datepicker.formatDate('mm/dd/yy', date);
            if (_.has(this.inventory, inventoryKey) && _.has(this.inventory[inventoryKey], datestr)) {
                return false;
            }
            else {
                r.debug('need to fetch ' + datestr + ' for ' + inventoryKey);
                return true;
            }
        }, this);
    },

    fetch_inventory: function(targeting, timing) {
        var srname = targeting.sr,
            collection = targeting.collection,
            geotarget = targeting.geotarget, 
            inventoryKey = targeting.inventoryKey,
            dates = timing.dates;
        dates.sort(function(d1,d2){return d1 - d2})
        var end = new Date(dates[dates.length-1].getTime())
        end.setDate(end.getDate() + 5)
        return $.ajax({
            type: 'GET',
            url: '/api/check_inventory.json',
            data: {
                sr: srname,
                collection: collection,
                country: geotarget.country,
                region: geotarget.region,
                metro: geotarget.metro,
                startdate: $.datepicker.formatDate('mm/dd/yy', dates[0]),
                enddate: $.datepicker.formatDate('mm/dd/yy', end)
            },
        });
    },

    get_check_inventory: function(targeting, timing) {
        var inventoryKey = targeting.inventoryKey;
        if (this.needs_to_fetch_inventory(targeting, timing)) {
            return this.fetch_inventory(targeting, timing).then(
                function(data) {
                    if (!r.sponsored.inventory[inventoryKey]) {
                        r.sponsored.inventory[inventoryKey] = {}
                    }

                    for (var datestr in data.inventory) {
                        if (!r.sponsored.inventory[inventoryKey][datestr]) {
                            r.sponsored.inventory[inventoryKey][datestr] = data.inventory[datestr]
                        }
                    }
                });
        } else {
            return true
        }
    },

    get_booked_inventory: function($form, srname, geotarget, isOverride) {
        var campaign_name = $form.find('input[name="campaign_name"]').val()
        if (!campaign_name) {
            return {}
        }

        var $campaign_row = $('.existing-campaigns .' + campaign_name)
        if (!$campaign_row.length) {
            return {}
        }

        if (!$campaign_row.data('paid')) {
            return {}
        }

        var existing_srname = $campaign_row.data("targeting")
        if (srname != existing_srname) {
            return {}
        }

        var existing_country = $campaign_row.data("country")
        if (geotarget.country != existing_country) {
            return {}
        }

        var existing_metro = $campaign_row.data("metro")
        if (geotarget.metro != existing_metro) {
            return {}
        }

        var existingOverride = $campaign_row.data("override")
        if (isOverride != existingOverride) {
            return {}
        }

        var startdate = $campaign_row.data("startdate"),
            enddate = $campaign_row.data("enddate"),
            dates = this.get_dates(startdate, enddate),
            bid = $campaign_row.data("bid"),
            cpm = $campaign_row.data("cpm"),
            ndays = this.duration_from_dates(startdate, enddate),
            impressions = this.calc_impressions(bid, cpm),
            daily = Math.floor(impressions / ndays),
            booked = {}

        _.each(dates, function(date) {
            var datestr = $.datepicker.formatDate('mm/dd/yy', date)
            booked[datestr] = daily
        })
        return booked

    },

    check_inventory: function($form, targeting, timing, budget, isOverride) {
        var bid = budget.bid,
            cpm = budget.cpm,
            requested = budget.impressions,
            daily_request = Math.floor(requested / timing.duration),
            inventoryKey = targeting.inventoryKey,
            booked = this.get_booked_inventory($form, targeting.sr, 
                    targeting.geotarget, isOverride);
        
        var minbid_amt = r.sponsored.get_real_min_bid();
        var maxbid_amt = r.sponsored.get_max_bid();

        $.when(r.sponsored.get_check_inventory(targeting, timing)).then(
            function() {
                var dates = timing.dates;
                var availableByDay = _.map(dates, function(date) {
                  var datestr = $.datepicker.formatDate('mm/dd/yy', date);
                  var daily_booked = booked[datestr] || 0;
                  return r.sponsored.inventory[inventoryKey][datestr] + daily_booked
                });
                React.renderComponent(
                  CampaignCreator({
                    bid: bid,
                    cpm: cpm,
                    dates: dates,
                    inventory: availableByDay,
                    isNew: !$("#campaign").parents('tr:first').length,
                    maxValidBid: parseFloat(maxbid_amt),
                    minValidBid: parseFloat(minbid_amt),
                    override: isOverride,
                    requested: requested,
                    targetName: targeting.displayName,
                  }),
                  document.getElementById('campaign-creator')
                );
            },
            function () {
                React.renderComponent(
                  CampaignSet(null,
                    InfoText(null,
                      r._('sorry, there was an error retrieving available impressions. ' +
                           'please try again later.')
                    )
                  ),
                  document.getElementById('campaign-creator')
                );
            }
        )
    },

    duration_from_dates: function(start, end) {
        return Math.round((Date.parse(end) - Date.parse(start)) / (86400*1000))
    },

    get_bid: function($form) {
        return parseFloat($form.find('*[name="bid"]').val()) || 0
    },

    get_cpm: function($form) {
        var isMetroGeotarget = $('#metro').val() !== null && !$('#metro').is(':disabled');
        var metro = $('#metro').val();
        var country = $('#country').val();
        var isGeotarget = country !== '' && !$('#country').is(':disabled');
        var isSubreddit = $form.find('input[name="targeting"][value="one"]').is(':checked');
        var collectionVal = $form.find('input[name="collection"]:checked').val();
        var isFrontpage = !isSubreddit && collectionVal === 'none';
        var isCollection = !isSubreddit && !isFrontpage;
        var sr = isSubreddit ? $form.find('*[name="sr"]').val() : '';
        var collection = isCollection ? collectionVal : null;
        var prices = [];

        if (isMetroGeotarget) {
            var metroKey = metro + country;
            prices.push(this.priceDict.METRO[metro] || this.priceDict.METRO_DEFAULT);
        } else if (isGeotarget) {
            prices.push(this.priceDict.COUNTRY[country] || this.priceDict.COUNTRY_DEFAULT);
        }

        if (isFrontpage) {
            prices.push(this.priceDict.COLLECTION_DEFAULT);
        } else if (isCollection) {
            prices.push(this.priceDict.COLLECTION[collectionVal] || this.priceDict.COLLECTION_DEFAULT);
        } else {
            prices.push(this.priceDict.SUBREDDIT[sr] || this.priceDict.SUBREDDIT_DEFAULT);
        }

        return _.max(prices);
    },

    get_targeting: function($form) {
        var isSubreddit = $form.find('input[name="targeting"][value="one"]').is(':checked'),
            collectionVal = $form.find('input[name="collection"]:checked').val(),
            isFrontpage = !isSubreddit && collectionVal === 'none',
            isCollection = !isSubreddit && !isFrontpage,
            type = isFrontpage ? 'frontpage' : isCollection ? 'collection' : 'subreddit',
            sr = isSubreddit ? $form.find('*[name="sr"]').val() : '',
            collection = isCollection ? collectionVal : null,
            displayName = isFrontpage ? 'the frontpage' : isCollection ? collection : sr,
            priority = this.get_priority($form),
            canGeotarget = isFrontpage || this.userIsSponsor,
            country = canGeotarget && $('#country').val() || '',
            region = canGeotarget && $('#region').val() || '',
            metro = canGeotarget && $('#metro').val() || '',
            geotarget = {'country': country, 'region': region, 'metro': metro},
            inventoryKey = this.get_inventory_key(sr, collection, geotarget),
            isValid = isFrontpage || (isSubreddit && sr) || (isCollection && collection);

        return {
            'type': type,
            'displayName': displayName,
            'isValid': isValid,
            'sr': sr,
            'collection': collection,
            'canGeotarget': canGeotarget,
            'geotarget': geotarget,
            'inventoryKey': inventoryKey,
        };
    },

    get_timing: function($form) {
        var startdate = $form.find('*[name="startdate"]').val(),
            enddate = $form.find('*[name="enddate"]').val(),
            duration = this.duration_from_dates(startdate, enddate),
            dates = r.sponsored.get_dates(startdate, enddate);

        return {
            'startdate': startdate,
            'enddate': enddate,
            'duration': duration,
            'dates': dates,
        }
    },

    get_budget: function($form) {
        var bid = this.get_bid($form),
            cpm = this.get_cpm($form),
            impressions = this.calc_impressions(bid, cpm);

        return {
            'bid': bid,
            'cpm': cpm,
            'impressions': impressions,
        };
    },

    get_priority: function($form) {
        var priority = $form.find('*[name="priority"]:checked'),
            isOverride = priority.data("override"),
            isCpm = priority.data("cpm");

        return {
            isOverride: isOverride,
            isCpm: isCpm,
        };
    },

    get_campaigns: function($list) {
        var campaignRows = $list.find('.existing-campaigns tbody tr').toArray(),
            collections = this.collectionsByName,
            subreddits = {},
            totalImpressions = 0,
            totalBid = 0;

        function mapSubreddit(name) {
            subreddits[name] = 1;
        }

        function getSubredditsByCollection(name) {
            return collections[name] && collections[name].sr_names || null;
        }

        function mapCollection(name) {
            var subredditNames = getSubredditsByCollection(name);
            if (subredditNames) {
                _.each(subredditNames, mapSubreddit);
            }
        }

        _.each(campaignRows, function(row) {
            var data = $(row).data(),
                isCollection = (data.targetingCollection === 'True'),
                mappingFunction = isCollection ? mapCollection : mapSubreddit;
            mappingFunction(data.targeting);
            var bid = parseFloat(data.bid, 10);
            var cpm = parseInt(data.cpm, 10);
            var impressions = bid / cpm * 1000 * 100;
            totalBid += bid;
            totalImpressions += impressions;
        });

        return {
            count: campaignRows.length,
            subreddits: _.keys(subreddits),
            totalBid: totalBid,
            totalImpressions: totalImpressions | 0,
            prettyBid: '$' + totalBid.toFixed(2),
            prettyImpressions: r.utils.prettyNumber(totalImpressions),
        };
    },

    get_reporting: function($form) {
        var link_text = $form.find('[name=link_text]').val(),
            owner = $form.find('[name=owner]').val();

        return {
            link_text: link_text,
            owner: owner,
        };
    },

    campaign_dashboard_help_template: _.template('<p>this promotion has a '
            + 'total budget of <%= prettyBid %> for <%= prettyImpressions %> '
            + 'impressions in <%= subreddits.length %> '
            + 'subreddit<% subreddits.length > 1 && print("s") %></p>'),

    render_campaign_dashboard_header: function() {
        var campaigns = this.get_campaigns($('.campaign-list'));
        var $campaignDashboardHeader = $('.campaign-dashboard header');
        if (campaigns.count) {
            $campaignDashboardHeader
                .find('.help').show().html(
                        this.campaign_dashboard_help_template(campaigns)).end()
                .find('.error').hide();
        }
        else {
            $campaignDashboardHeader
                .find('.error').show().end()
                .find('.help').hide();
        }
    },

    on_date_change: function() {
        this.render()
    },

    on_bid_change: function() {
        this.render()
    },

    on_impression_change: function() {
        var $form = $("#campaign"),
            cpm = this.get_cpm($form),
            impressions = parseInt($form.find('*[name="impressions"]').val().replace(/,/g, "") || 0),
            bid = this.calc_bid(impressions, cpm),
            $bid = $form.find('*[name="bid"]')
        $bid.val(bid)
        $bid.trigger("change")
    },

    fill_campaign_editor: function() {
        var $form = $("#campaign"),
            priority = this.get_priority($form),
            targeting = this.get_targeting($form),
            timing = this.get_timing($form),
            ndays = timing.duration,
            budget = this.get_budget($form),
            cpm = budget.cpm,
            impressions = budget.impressions,
            checkInventory = targeting.isValid && priority.isCpm;

        $(".duration").text(ndays + " " + ((ndays > 1) ? r._("days") : r._("day")))
        $(".price-info").text(r._("$%(cpm)s per 1,000 impressions").format({cpm: (cpm/100).toFixed(2)}))
        $form.find('*[name="impressions"]').val(r.utils.prettyNumber(impressions))
        $(".OVERSOLD").hide()


        if (targeting.isValid) {
            this.enable_form($form)
        }

        if (priority.isCpm) {
            this.show_cpm()
            this.check_bid($form)
        } else {
            this.hide_cpm()
        }

        if (checkInventory) {
            this.check_inventory($form, targeting, timing, budget, priority.isOverride)
        }
        else if (!priority.isCpm) {
          React.renderComponent(
            CampaignSet(null,
              InfoText(null, r._('house campaigns, man.')),
              CampaignOptionTable(null,
                CampaignOption({
                  bid: null,
                  end: timing.enddate,
                  impressions: 'unsold ',
                  isNew: !$("#campaign").parents('tr:first').length,
                  primary: true,
                  start: timing.startdate,
                })
              )
            ),
            document.getElementById('campaign-creator')
          );
        }
            
        if (targeting.canGeotarget) {
            this.enable_geotargeting();
        } else {
            this.disable_geotargeting();
        }
    },

    disable_geotargeting: function() {
        $('.geotargeting-selects').find('select').prop('disabled', true).end().hide();
        $('.geotargeting-disabled').show();
    },

    enable_geotargeting: function() {
        $('.geotargeting-selects').find('select').prop('disabled', false).end().show();
        $('.geotargeting-disabled').hide();
    },

    disable_form: function($form) {
        $form.find('.create, button[name="save"]')
            .prop("disabled", true)
            .addClass("disabled");
    },

    enable_form: function($form) {
        $form.find('.create, button[name="save"]')
            .prop("disabled", false)
            .removeClass("disabled");
    },

    hide_cpm: function() {
        $('.budget-field').css('display', 'none');
    },

    show_cpm: function() {
        $('.budget-field').css('display', 'block');
    },

    subreddit_targeting: function() {
        $('.subreddit-targeting').find('*[name="sr"]').prop("disabled", false).end().slideDown();
        $('.collection-targeting').find('*[name="collection"]').prop("disabled", true).end().slideUp();
        this.render()
    },

    collection_targeting: function() {
        $('.subreddit-targeting').find('*[name="sr"]').prop("disabled", true).end().slideUp();
        $('.collection-targeting').find('*[name="collection"]').prop("disabled", false).end().slideDown();
        this.render()
    },

    priority_changed: function() {
        this.render()
    },

    update_regions: function() {
        var $country = $('#country'),
            $region = $('#region'),
            $metro = $('#metro')

        $region.find('option').remove().end().hide()
        $metro.find('option').remove().end().hide()
        $region.prop('disabled', true)
        $metro.prop('disabled', true)

        if (_.has(this.regions, $country.val())) {
            _.each(this.regions[$country.val()], function(item) {
                var code = item[0],
                    name = item[1],
                    selected = item[2]

                $('<option/>', {value: code, selected: selected}).text(name).appendTo($region)
            })
            $region.prop('disabled', false)
            $region.show()
        }
    },

    update_metros: function() {
        var $region = $('#region'),
            $metro = $('#metro')

        $metro.find('option').remove().end().hide()
        if (_.has(this.metros, $region.val())) {
            _.each(this.metros[$region.val()], function(item) {
                var code = item[0],
                    name = item[1],
                    selected = item[2]

                $('<option/>', {value: code, selected: selected}).text(name).appendTo($metro)
            })
            $metro.prop('disabled', false)
            $metro.show()
        }
    },

    country_changed: function() {
        this.update_regions()
        this.render()
    },

    region_changed: function() {
        this.update_metros()
        this.render()
    },

    metro_changed: function() {
        this.render()
    },

    get_min_bid: function() {
        return $('#bid').data('min_bid');
    },

    get_real_min_bid: function() {
        return $('#bid').data('real_min_bid');
    },

    get_max_bid: function() {
        return $('#bid').data('max_bid');
    },

    check_bid: function($form) {
        var bid = this.get_bid($form),
            minimum_bid = this.get_min_bid(),
            campaignName = $form.find('*[name=campaign_name]').val()

        $('.budget-change-warning').hide()
        if (campaignName != '') {
            var $campaignRow = $('.' + campaignName),
                campaignIsPaid = $campaignRow.data('paid'),
                campaignBid = $campaignRow.data('bid')

            if (campaignIsPaid && bid != campaignBid) {
                $('.budget-change-warning').show()
            }
        }

        $(".minimum-spend").removeClass("error");
        if (bid < minimum_bid) {
            $(".minimum-spend").addClass("error");
            this.disable_form($form)
        }
    },

    calc_impressions: function(bid, cpm_pennies) {
        return Math.floor(bid / cpm_pennies * 1000 * 100);
    },

    calc_bid: function(impressions, cpm_pennies) {
        return (Math.floor(impressions * cpm_pennies / 1000) / 100).toFixed(2)
    },

    render_timing_duration: function($form, ndays) {
        $form.find('.timing-field .duration').text(
                ndays + " " + ((ndays > 1) ? r._("days") : r._("day")));
    },

    fill_inventory_form: function() {
        var $form = $('.inventory-dashboard'),
            targeting = this.get_targeting($form),
            timing = this.get_timing($form);

        this.render_timing_duration($form, timing.duration);
    },

    submit_inventory_form: function() {
        var $form = $('.inventory-dashboard'),
            targeting = this.get_targeting($form),
            timing = this.get_timing($form);

        var data = {
            startdate: timing.startdate,
            enddate: timing.enddate,
        };

        if (targeting.type === 'collection') {
            data.collection_name = targeting.collection;
        }
        else if (targeting.type === 'subreddit') {
            data.sr_name = targeting.sr;
        }

        this.reload_with_params(data);
    },

    fill_reporting_form: function() {
        var $form = $('.reporting-dashboard'),
            timing = this.get_timing($form);

        this.render_timing_duration($form, timing.duration);
    },

    submit_reporting_form: function() {
        var $form = $('.reporting-dashboard'),
            timing = this.get_timing($form),
            reporting = this.get_reporting($form);

        var data = {
            startdate: timing.startdate,
            enddate: timing.enddate,
            link_text: reporting.link_text,
            owner: reporting.owner,
        };

        this.reload_with_params(data);
    },

    fill_roadblock_form: function() {
        var $form = $('.roadblock-dashboard'),
            timing = this.get_timing($form);

        this.render_timing_duration($form, timing.duration);
    },

    reload_with_params: function(data) {
        var queryString = '?' + $.param(data);
        var location = window.location;
        window.location = location.origin + location.pathname + queryString;
    },

    mediaInputChange: function() {
        var $scraperInputWrapper = $('#scraper_input');
        var $rgInputWrapper = $('#rg_input');
        var isScraper = $(this).val() === 'scrape';

        $scraperInputWrapper.toggle(isScraper);
        $scraperInputWrapper.find('input').prop('disabled', !isScraper);
        $rgInputWrapper.toggle(!isScraper);
        $rgInputWrapper.find('input').prop('disabled', isScraper);
    },
};

}(r);

var dateFromInput = function(selector, offset) {
   if(selector) {
     var input = $(selector);
     if(input.length) {
        var d = new Date();
        offset = $.with_default(offset, 0);
        d.setTime(Date.parse(input.val()) + offset);
        return d;
     }
   }
};

function attach_calendar(where, min_date_src, max_date_src, callback, min_date_offset) {
     $(where).siblings(".datepicker").mousedown(function() {
            $(this).addClass("clicked active");
         }).click(function() {
            $(this).removeClass("clicked")
               .not(".selected").siblings("input").focus().end()
               .removeClass("selected");
         }).end()
         .focus(function() {
          var target = $(this);
          var dp = $(this).siblings(".datepicker");
          if (dp.children().length == 0) {
             dp.each(function() {
               $(this).datepicker(
                  {
                      defaultDate: dateFromInput(target),
                          minDate: dateFromInput(min_date_src, min_date_offset),
                          maxDate: dateFromInput(max_date_src),
                          prevText: "&laquo;", nextText: "&raquo;",
                          altField: "#" + target.attr("id"),
                          onSelect: function() {
                              $(dp).addClass("selected").removeClass("clicked");
                              $(target).blur();
                              if(callback) callback(this);
                          }
                })
              })
              .addClass("drop-choices");
          };
          dp.addClass("inuse active");
     }).blur(function() {
        $(this).siblings(".datepicker").not(".clicked").removeClass("inuse");
     }).click(function() {
        $(this).siblings(".datepicker.inuse").addClass("active");
     });
}

function sum(a, b) {
    // for things like _.reduce(list, sum);
    return a + b;
}

function check_enddate(startdate, enddate) {
  var startdate = $(startdate)
  var enddate = $(enddate);
  if(dateFromInput(startdate) >= dateFromInput(enddate)) {
    var newd = new Date();
    newd.setTime(startdate.datepicker('getDate').getTime() + 86400*1000);
    enddate.val((newd.getMonth()+1) + "/" +
      newd.getDate() + "/" + newd.getFullYear());
  }
  $("#datepicker-" + enddate.attr("id")).datepicker("destroy");
}

(function($) {
    $.update_campaign = function(campaign_name, campaign_html) {
        cancel_edit(function() {
            var $existing = $('.existing-campaigns .' + campaign_name),
                tableWasEmpty = $('.existing-campaigns table tr.campaign-row').length == 0

            if ($existing.length) {
                $existing.replaceWith(campaign_html)
                $existing.fadeIn()
            } else {
                $(campaign_html).hide()
                .appendTo('.existing-campaigns tbody')
                .css('display', 'table-row')
                .fadeIn()
            }

            if (tableWasEmpty) {
                $('.existing-campaigns p.error').hide()
                $('.existing-campaigns table').fadeIn()
                $('#campaign .buttons button[name=cancel]').removeClass('hidden')
                $("button.new-campaign").prop("disabled", false);
            }

            r.sponsored.render_campaign_dashboard_header();
        })
    }
}(jQuery));

function detach_campaign_form() {
    /* remove datepicker from fields */
    $("#campaign").find(".datepicker").each(function() {
            $(this).datepicker("destroy").siblings().unbind();
        });

    /* detach and return */
    var campaign = $("#campaign").detach();
    return campaign;
}

function cancel_edit(callback) {
    var $campaign = $('#campaign');
    var isEditingExistingCampaign = !!$campaign.parents('tr:first').length;

    if (isEditingExistingCampaign) {
        var tr = $campaign.parents("tr:first").prev();
        /* copy the campaign element */
        /* delete the original */
        $campaign.slideUp(function() {
                $(this).parent('tr').prev().fadeIn();
                var td = $(this).parent();
                var campaign = detach_campaign_form();
                td.delete_table_row(function() {
                        tr.fadeIn(function() {
                                $('.new-campaign-container').append(campaign);
                                campaign.hide();
                                if (callback) { callback(); }
                            });
                    });
            });
    } else {
        var keep_open = $campaign.hasClass('keep-open');
        
        if ($campaign.is(':visible') && !keep_open) {
            $campaign.slideUp(callback);
        } else if (callback) {
            callback();
        }

        if (keep_open) {
            $campaign.removeClass('keep-open');
            $campaign.find('.status')
                .text(r._('Created new campaign!'))
                .show()
                .delay(1000)
                .fadeOut();

            r.sponsored.render();
        }
    }
}

function send_campaign(close) {
    if (!close) {
        $('#campaign').addClass('keep-open');
    }

    post_pseudo_form('.campaign', 'edit_campaign');
}

function del_campaign($campaign_row) {
    var link_id36 = $("#campaign").find('*[name="link_id36"]').val(),
        campaign_id36 = $campaign_row.data('campaign_id36')
    $.request("delete_campaign", {"campaign_id36": campaign_id36,
                                  "link_id36": link_id36},
              null, true, "json", false);
    $campaign_row.children(":first").delete_table_row(function() {
        r.sponsored.render_campaign_dashboard_header();
        return check_number_of_campaigns();
    });
}


function edit_campaign($campaign_row) {
    cancel_edit(function() {
        cancel_edit_promotion();
        var campaign = detach_campaign_form(),
            campaignTable = $(".existing-campaigns table").get(0),
            editRowIndex = $campaign_row.get(0).rowIndex + 1
            $editRow = $(campaignTable.insertRow(editRowIndex)),
            $editCell = $("<td>").attr("colspan", r.sponsored.campaignListColumns).append(campaign)

        $editRow.attr("id", "edit-campaign-tr")
        $editRow.append($editCell)
        $campaign_row.fadeOut(function() {
            /* fill inputs from data in campaign row */
            _.each(['startdate', 'enddate', 'bid', 'campaign_id36', 'campaign_name'],
                function(input) {
                    var val = $campaign_row.data(input),
                        $input = campaign.find('*[name="' + input + '"]')
                    $input.val(val)
            })

            /* set priority */
            var priorities = campaign.find('*[name="priority"]'),
                campPriority = $campaign_row.data("priority")

            priorities.filter('*[value="' + campPriority + '"]')
                .prop("checked", "checked")

            /* check if targeting is turned on */
            var targeting = $campaign_row.data("targeting"),
                radios = campaign.find('*[name="targeting"]'),
                isCollection = ($campaign_row.data("targeting-collection") === "True"),
                collectionTargeting = isCollection ? targeting : 'none';
            if (targeting && !isCollection) {
                radios.filter('*[value="one"]')
                    .prop("checked", "checked");
                campaign.find('*[name="sr"]').val(targeting).prop("disabled", false).end()
                    .find(".subreddit-targeting").show();    
                $(".collection-targeting").hide();
            } else {
                radios.filter('*[value="collection"]')
                    .prop("checked", "checked");
                $('.collection-targeting input[value="' + collectionTargeting + '"]')
                    .prop("checked", "checked");
                campaign.find('*[name="sr"]').val("").prop("disabled", true).end()
                    .find(".subreddit-targeting").hide();
                $('.collection-targeting').show();
            }

            r.sponsored.collapse_collection_selector();

            /* set geotargeting */
            var country = $campaign_row.data("country"),
                region = $campaign_row.data("region"),
                metro = $campaign_row.data("metro")
            campaign.find("#country").val(country)
            r.sponsored.update_regions()
            if (region != "") {
                campaign.find("#region").val(region)
                r.sponsored.update_metros()

                if (metro != "") {
                    campaign.find("#metro").val(metro)
                }
            }

            /* attach the dates to the date widgets */
            init_startdate();
            init_enddate();

            campaign.find('button[name="save"]').show().end()
                .find('.create').hide().end();
            campaign.slideDown();
            r.sponsored.render();
        })
    })
}

function check_number_of_campaigns(){
    if ($(".campaign-row").length >= $(".existing-campaigns").data("max-campaigns")){
      $(".error.TOO_MANY_CAMPAIGNS").fadeIn();
      $("button.new-campaign").prop("disabled", true);
      return true;
    } else {
      $(".error.TOO_MANY_CAMPAIGNS").fadeOut();
      $("button.new-campaign").prop("disabled", false);
      return false;
    }
}

function create_campaign() {
    if (check_number_of_campaigns()){
        return;
    }
    cancel_edit(function() {
            cancel_edit_promotion();
            var defaultBid = $("#bid").data("default_bid");

            init_startdate();
            init_enddate();

            $('#campaign')
                .find(".collection-targeting").show().end()
                .find('input[name="collection"]').prop("disabled", false).end()
                .find('input[name="collection"]').eq(0).prop("checked", "checked").end().end()
                .find('input[name="collection"]').slice(1).prop("checked", false).end().end()
                .find('.collection-selector .form-group-list').css('top', 0).end()
            r.sponsored.collapse_collection_selector();

            $("#campaign")
                .find('button[name="save"]').hide().end()
                .find('.create').show().end()
                .find('input[name="campaign_id36"]').val('').end()
                .find('input[name="campaign_name"]').val('').end()
                .find('input[name="sr"]').val('').prop("disabled", true).end()
                .find('input[name="targeting"][value="collection"]').prop("checked", "checked").end()
                .find('input[name="priority"][data-default="true"]').prop("checked", "checked").end()
                .find('input[name="bid"]').val(defaultBid).end()
                .find(".subreddit-targeting").hide().end()
                .find('select[name="country"]').val('').end()
                .find('select[name="region"]').hide().end()
                .find('select[name="metro"]').hide().end()
                .slideDown();
            r.sponsored.render();
        });
}

function free_campaign($campaign_row) {
    var link_id36 = $("#campaign").find('*[name="link_id36"]').val(),
        campaign_id36 = $campaign_row.data('campaign_id36')
    $.request("freebie", {"campaign_id36": campaign_id36, "link_id36": link_id36},
              null, true, "json", false);
    $campaign_row.find(".free").fadeOut();
    return false; 
}

function terminate_campaign($campaign_row) {
    var link_id36 = $("#campaign").find('*[name="link_id36"]').val(),
        campaign_id36 = $campaign_row.data('campaign_id36')
    $.request("terminate_campaign", {"campaign_id36": campaign_id36,
                                     "link_id36": link_id36},
              null, true, "json", false);
}

function edit_promotion() {
    $("button.new-campaign").prop("disabled", false);
    cancel_edit(function() {
        $('.promotelink-editor')
            .find('.collapsed-display').slideUp().end()
            .find('.uncollapsed-display').slideDown().end()
    })
    return false;
}

function cancel_edit_promotion() {
    $('.promotelink-editor')
        .find('.collapsed-display').slideDown().end()
        .find('.uncollapsed-display').slideUp().end()

    return false;
}

function cancel_edit_campaign() {
    $("button.new-campaign").prop("disabled", false);
    return cancel_edit()
}

!function(exports) {
    /*
     * @param {number[]} days An array of inventory for the campaign's timing
     * @param {number} minValidRequest The minimum request a campaign is allowed
     *                                 to have, should be in the same units as `days`
     * @param {number} requested The campaign's requested inventory, in the same
     *                           units as `days` and `minValidRequest`.
     * @param {number} maxOffset maximum valid start index
     * @returns {{days: number[], maxRequest: number, offset:number}|null}
     *                            The sub-array, maximum request for it, and
     *                            its offset from the original `days` array.
     */
    exports.getMaximumRequest = _.memoize(
      function getMaximumRequest(days, minValidRequest, requested, maxOffset) {
        return check(days, 0);

        /**
         * check if a set of days is valid, then compare to results of this 
         * function called on subsets of that date range
         * @param  {Number[]} days inventory values
         * @param  {Number} offset offset from the original days array we are
         *                         working on
         * @return {Object|null}  object describing the best range found,
         *                        or null if no valid range was found
         */
        function check(days, offset) {
          var bestOption = null;
          if (days.length > 0 && offset <= maxOffset) {
            // check the validity of the days array.
            var minValue = min(days);
            var maxRequest = minValue * days.length;
            if (maxRequest >= minValidRequest) {
              bestOption = {days: days, maxRequest: maxRequest, offset: offset};
            }
          }
          if (bestOption === null || bestOption.maxRequest < requested) {
            // if bestOptions does not hit our target, check sub-arrays.  start
            // by splitting on values that invalidate the date range (anything
            // with inventory below the minimum daily amount).
            // subtract 0.1 because the comparison used to filter is > (not >=)
            var minDaily = days.length / minValidRequest - 0.1;
            return split(days, offset, bestOption, minDaily, check, true)
          }
          else {
            return bestOption;
          }
        }
      },
      function hashFunction(days, minValidRequest, requested) {
        return [days.join(','), minValidRequest, requested].join('|');
      }
    );

    /**
     * compare two date range options, returning the better
     * options are compared on their maximum request first, then their duration
     * @param  {Object|null} a
     * @param  {Object|null} b
     * @return {Object|null}
     */
    function compare(a, b) {
      if (!b) {
        return a;
      }
      else if (!a) {
        return b;
      }
      if (b.maxRequest > a.maxRequest ||
          (b.maxRequest === a.maxRequest && b.days.length > a.days.length)) {
        return b;
      }
      else {
        return a;
      }
    }

    function min(arr) {
      return Math.min.apply(Math, arr);
    }

    /**
     * split an array of inventory into sub-arrays, checking each
     * @param  {number[]} days - inventory data for a range of contiguous dates
     * @param  {number} offset - index offset from original array
     * @param  {Object|null} bestOption - current best option
     * @param  {number} minValue - value used to split the days array on; values
     *                             below this are excluded
     * @param  {function} check - function to call on sub-arrays
     * @param  {boolean} recurse - whether or not to call this function again if
     *                             unable to split array (more on this below)
     * @return {Object|null} - best option found
     */
    function split(days, offset, bestOption, minValue, check, recurse) {
      var sub = [];
      var subOffset = 0;
      for (var i = 0, l = days.length; i < l; i++) {
        if (days[i] > minValue) {
          if (sub.length === 0) {
            subOffset = offset + i;
          }
          sub.push(days[i])
        }
        else {
          // whenever we hit the end of a contiguous set of days above the 
          // minValue threshold, compare that sub-array to our current bestOption
          if (sub.length) {
            bestOption = compare(bestOption, check(sub, subOffset))
            sub = [];
          }
        }
      }
      if (sub.length === days.length) {
        // if the array was not split at all:
        if (recurse) {
          // if we were previously splitting on the minimum valid value, try
          // splitting on the smallest value in the array.  The `recurse` value
          // prevents this from looping infinitely
          return compare(bestOption, split(days, offset, null, min(days), check, false));
        }
        else {
          // otherwise, just return the current best
          return bestOption;
        }
      }
      else if (sub.length) {
        // need to compare the last sub array, as it won't checked in the for loop
        return compare(bestOption, check(sub, subOffset));
      }
      else {
        // if _no_ values were found above the minValue threshold
        return bestOption;
      }
    }
}(r.sponsored);
