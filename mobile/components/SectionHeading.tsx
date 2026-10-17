import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {palette} from '../theme/tokens';
export function SectionHeading({eyebrow,title}:{eyebrow:string;title:string}){return <View style={styles.wrap}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text></View>;}
const styles=StyleSheet.create({wrap:{paddingVertical:3},eyebrow:{fontSize:10,letterSpacing:1.8,fontWeight:'800',color:palette.primary},title:{fontSize:21,fontWeight:'900',color:palette.text,marginTop:5}});
