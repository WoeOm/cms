/**
 * React Starter Kit (https://www.reactstarterkit.com/)
 *
 * Copyright © 2014-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import withStyles from 'isomorphic-style-loader/lib/withStyles';
import s from './Home.css';
import Form from 'react-jsonschema-form';

const GenerateSchema = require('generate-schema');

const schema = GenerateSchema.json('Product', {
  id: 2,
  name: 'An ice sculpture',
  price: 12.5,
  tags: ['cold', 'ice'],
  dimensions: {
    length: 7.0,
    width: 12.0,
    height: 9.5,
  },
  warehouseLocation: {
    latitude: -78.75,
    longitude: 20.4,
  },
});

//
// const schema ={
//   title: "Todo",
//
//   properties:   {
//     "name": "An ice sculpture",
//     "price": 12.50,
//     "tags": ["cold", "ice"],
//     "dimensions": {
//       "length": 7.0,
//       "width": 12.0,
//       "height": 9.5
//     },
//     "warehouseLocation": {
//       "latitude": -78.75,
//       "longitude": 20.4
//     }
//
//
// }}

console.log(schema);

const log = type => console.log.bind(console, type);

class Home extends React.Component {
  static propTypes = {
    news: PropTypes.arrayOf(
      PropTypes.shape({
        title: PropTypes.string.isRequired,
        link: PropTypes.string.isRequired,
        content: PropTypes.string,
      }),
    ).isRequired,
  };

  render() {
    const options = {
      lineNumbers: true,
    };
    return (
      <div className={s.root}>
        <div className={s.container}>
          <div id="" />
          <textarea />
          <Form
            schema={schema}
            onChange={log('changed')}
            onSubmit={log('submitted')}
            onError={log('errors')}
          />
        </div>
      </div>
    );
  }
}

export default withStyles(s)(Home);
