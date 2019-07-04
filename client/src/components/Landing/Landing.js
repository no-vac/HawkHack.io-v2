import React, { Component } from 'react'
import Hero from "./sections/Hero"
import About from "./sections/About"
import NavBar from "./sections/NavBar"
import Faq from "./sections/Faq"

class LandingPage extends Component {
    render() {
        return (
            <div>
                <NavBar />
                <Hero />
                <About />
                <Faq />
            </div>
        )
    }
}

export default LandingPage