import { Tabs } from 'expo-router'
import FontAwesome from "@expo/vector-icons/FontAwesome"

export default function TabsLayout() {
    return <Tabs
        screenOptions={{
            headerShown: false,
            tabBarLabelPosition: "below-icon",
            tabBarShowLabel: true,
            tabBarActiveTintColor: "#698ee5ff",
            tabBarInactiveTintColor: "#747679ff",
        }}    
    >
        <Tabs.Screen name='Explore' options={{
            tabBarLabel: "Explore",
            tabBarIcon: ({ color }) => <FontAwesome name="map-marker" size={24} color={color} />,
            title:"Explore"
        }} />
        <Tabs.Screen name='Saved'  options={{
            tabBarLabel: "saved",
            tabBarIcon: ({ color }) => <FontAwesome name="bookmark" size={24} color={color} />,
            title: "Saved"
        }}/>
        <Tabs.Screen name='Profile' options={{
            tabBarLabel: "My Profile",
            tabBarIcon: ({ color }) => <FontAwesome name="user" size={24} color={color} />,
            title:"Me"
        }} />
    </Tabs>
}

